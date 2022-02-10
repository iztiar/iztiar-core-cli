/*
 * coreForkable
 */
import chalk from 'chalk';
import cp from 'child_process';

import { Iztiar, coreConfig, coreError, coreRunfile, msg, utils } from './imports.js';

export class coreForkable {

    static s = {
        STARTING: 'starting',
        RUNNING: 'running',
        STOPPING: 'stopping'
    };

    /**
     * @param {string} name the name of the service controller
     * @param {boolean} withConsole whether display the actions to the console, or run in batch mode (no display)
     * @returns {Promise} a promise which will eventually resolves with a result or false
     */
    static checkServiceByName( name, withConsole ){
        msg.debug( 'coreForkable.checkServiceByName()', 'name='+name, 'withConsole='+withConsole );
        const _json = coreRunfile.jsonByName( name );
        return coreForkable.checkServiceWithJson( name, _json, withConsole );
    }

    /**
     * @param {string} name the name of the service controller
     * @param {JSON|null} json the content of the JSON runfile
     * @param {boolean} withConsole whether display the actions to the console, or run in batch mode (no display, default)
     * @returns {Promise} a promise which will eventually resolves with an Object as {}
     *    reasons: []               array of error messages (one per found error), length=0 says that service is full ok, up and running
     *    startable: true|false     whether the service could be started, i.e. only if the runfile is empty or not present
     *    pids: []                  array of pids
     *    ports: []                 array of ports number
     *    status: JSON object       { forkable: full_status }
     * Note:
     *  Most of the done checks are asynchronous, and are so implemented as Promises.
     *  Because we want to be able to use this same function to display the global status to the console,
     *  we have to take care of sequentializing the displays of messages, running checks, and their results.
     *  As a consequence, all actions are implemented as Promises, and dynamically chained here.
     */
    static checkServiceWithJson( name, json, withConsole=false ){
        msg.debug( 'coreForkable.checkServiceWithJson()', 'name='+name );
        let _checkResult = { reasons:[], startable:true, pids:[], ports:[], status:{} };
        const _origLevel = msg.consoleLevel();
        if( !withConsole ){
            msg.consoleLevel( 0 );
        }
        const verbose = _origLevel >= Iztiar.c.verbose.VERBOSE;
        //console.log( 'origLevel='+_origLevel, 'Iztiar.c.verbose.VERBOSE='+Iztiar.c.verbose.VERBOSE, 'verbose='+verbose );
        let _promise = Promise.resolve( true );

        //  using promises here happens to be rather conterproductive as the functions are already mainly used inside of Promises
        const _cinfo = function(){
            if( msg.consoleLevel() >= Iztiar.c.verbose.INFO ){ console.log( ...arguments )};
        }
        const _cerr = function(){
            _checkResult.reasons.push( ...arguments );
            Object.values( arguments ).every(( m ) => { msg.error( '  '+m )});
        }

        msg.out( 'Examining \''+name+'\' service' );

        // if name is invalid, just stop here
        if( name === 'ALL' ){
            _cerr( coreError.e.NAME_ALL_INVALID );
            _checkResult.startable = false;
            _promise = _promise.then(() => { return Promise.resolve( _checkResult )});

        // the runfile content is empty or is not present: the only error case where the service is startable
        } else if( !json || !Object.keys( json ).length ){
            _cerr( coreError.e.RUNFILE_NOTFOUNDOREMPTY );
            _checkResult.startable = true;
            _promise = _promise.then(() => { return Promise.resolve( _checkResult )});

        // else there is some things to check...
        } else {
            _checkResult.startable = false;
            const _processes = coreRunfile.processesFromJson( json );
            //msg.out( _processes );
            // get { errs: [], procs: { forkable: { name, pid, port }}} or error_message_string in processes.errs array
            _processes.errs.every(( m ) => { _cerr( m )});
            const _runProcs = _processes.procs;

            // just display the title for each forkable
            const _displayPromise = function( forkable ){
                return new Promise(( resolve, reject ) => {
                    msg.out( ' '+chalk.blue( forkable ), _runProcs[forkable] );
                    resolve( true );
                });
            };

            // local functions defined here to have access to _runProcs variable
            // pidPromise() checks if pid is alive and resolves with true|false
            const _pidPromise = function( forkable, pid ){
                //msg.out( 'entering pidPromise', 'forkable='+forkable, 'pid='+pid );
                if( !pid ){
                    msg.warn( 'pid not checked as not present' );
                    return Promise.resolve( false );
                } else {
                    return new Promise(( resolve, reject ) => {
                        utils.isAlivePid( pid )
                            .then(( res ) => {
                                if( res ){
                                    _checkResult.pids.push( pid );
                                    const _local = { user:res[0].user, time:res[0].time, elapsed:res[0].elapsed };
                                    _cinfo( '  pid='+pid+' is alive', _local );
                                    resolve( true );
                                } else {
                                    _cerr( 'pid='+pid+' is dead' );
                                    resolve( false );
                                }
                            });
                    });
                }
            };

            // portPromise() pings the port and resolves true|false
            const _portPromise = function( forkable, port ){
                if( !port ){
                    msg.warn( 'communication not checked as port not present' );
                    return Promise.resolve( false );
                } else {
                    return new Promise(( resolve, reject ) => {
                        utils.isAlivePort( port )
                            .then(( res ) => {
                                if( res ){
                                    _checkResult.ports.push( port );
                                    _cinfo( '  port='+port+' answers', res );
                                    resolve( true );
                                } else {
                                    _cerr( 'port='+port+' doesn\'t answer to ping' );
                                    resolve( false );
                                }
                            });
                    });
                }
            };

            // statusPromise() requests the server for its status and resolves with the status or false
            const _statusPromise = function( forkable, port ){
                if( !port ){
                    msg.warn( 'status not requested as port not present' );
                    return Promise.resolve( false );
                } else if( !_checkResult.ports.includes( port )){
                    msg.warn( 'status not requested as port didn\'t answered to previous ping' );
                    return Promise.resolve( false );
                } else {
                    return new Promise(( resolve, reject ) => {
                        utils.tcpRequest( port, 'iz.status' )
                            .then(( res ) => {
                                let _answeredName = null;
                                let _answeredPid = 0;
                                let _answeredManager = null;
                                let _errs = 0;
                                if( res ){
                                    _answeredName = Object.keys( res )[0];
                                    _answeredPid = res[_answeredName].pid;
                                    _answeredManager = res[_answeredName].manager;
                                    if( _answeredName !== forkable ){
                                        _errs += 1;
                                        _cerr( 'statusOf answers from '+_answeredName+' while '+forkable+' was expected' );
                                    }
                                    if( _answeredName === Iztiar.c.forkable.BROKER && _answeredManager !== name ){
                                        _errs += 1;
                                        _cerr( 'statusOf answers with \''+_answeredManager+'\' manager while \''+name+'\' was expected' );
                                    }
                                    if( _answeredPid !== _runProcs[forkable].pid ){
                                        _errs += 1;
                                        _cerr( 'statusOf answers from pid='+_answeredPid+' while pid='+_runProcs[forkable].pid+' was expected' );
                                    }
                                    if( _errs ){
                                        resolve( false );
                                    } else {
                                        _checkResult.status[forkable] = res[_answeredName];
                                        //console.log( res[_answeredName] );
                                        const _child = Object.keys( res )[0];
                                        const _local = { forkable:_answeredName, pid:res[_answeredName].pid, manager:_answeredManager };
                                        _cinfo( '  statusOf answers', verbose ? res[_answeredName] : _local );
                                        resolve( true );
                                    }
                                } else {
                                    _cerr( 'statusOf request rejected' );
                                    resolve( false );
                                }
                            }, ( rej ) => {
                                _cerr( 'statusOf request rejected' );
                                resolve( false );
                            });
                    });
                }
            }

            // let chain and check
            for( const _forkable in _runProcs ){
                //msg.out( _forkable );
                _promise = _promise
                    .then(() => { return _displayPromise( _forkable )})
                    .then(() => { return _pidPromise( _forkable, _runProcs[_forkable].pid )})
                    .then(() => { return _portPromise( _forkable, _runProcs[_forkable].port )})
                    .then(() => { return _statusPromise( _forkable, _runProcs[_forkable].port )});
            }
        }

        _promise = _promise.then(() => {
            msg.consoleLevel( _origLevel );
            return Promise.resolve( _checkResult )
        });

        return _promise;
    }

    /**
     * fork this process
     *  actually re-running our same CLI command in a dedicated environment
     *  (parent process)
     * @param {string} forkable the forkable to fork
     * @param {Callback} ipcCallback a ( child, messageData ) callback to be triggered when receiving IPC messages
     * @param {string[]} args the command-line arguments to be considered, defaulting to process.argv
     * @returns {ChidlProcess} the forked child process
     * 
     * Note:
     *  Node.js sets up a communication channel between the parent process and the forked child process.
     *  child.send( message ) is received on the callback below.
     *  Unfortunately this means that the parent has to stay running. which is not what we want
     *  (at least in the main-vs-coreController relation case).
     *  So, the IPC channel is only used for advertising the parent of the startup event.
     * 
     * Note:
     *  Execute in parent process.
     */
    static startupFork( forkable, ipcCallback, args ){
        msg.debug( 'coreForkable::startupFork() about to fork '+forkable );
        const _path = process.argv[1];
        let _args = args ? [ ...args ] : [ ...process.argv ];
        _args.shift();
        _args.shift();
        msg.debug( 'coreForkable.startupFork()', 'forking with path='+_path, 'args', _args );
        let _env = { ...process.env };
        _env[Iztiar.c.forkable.uuid] = forkable; // this says to the child that it has been forked
        let _options = {
            detached: true,
            env: _env
        };

        let child = cp.fork( _path, _args, _options );

        child.on( 'message', ( messageData ) => {
            ipcCallback( child, messageData );
        });

        return child;
    }

    /**
     * Forward to the parent process the startup message received from the child process
     * Note:
     *  This is a flat hierarchy where the main top coreController forwards to its main CLI process
     *  parent the IPC messages which are received from managed coreController(s) and coreBroker(s).
     *  The hierarchy is said flat because managed coreController(s) cannot manage themselves
     *  other coreControllers. So there is only one level.
     * 
     * @param {Object} messageData 
     */
     static startupOnIPCForward( messageData ){
        if( Iztiar.envForked() === Iztiar.c.forkable.CONTROLLER ){
            msg.debug( 'coreForkable.startupOnIPCForward()', 'forwarding' );
            messageData.event = 'forwarded';
            process.send( messageData );
        }
    }

    /**
     * This function should be eventually called for each received IPC message for taking care of common tasks
     * - creates the JSON runfile
     * - forward messages to parent if needed
     * @param {ChildProcess} child the child process as returned by fork
     * @param {Object} messageData the data received through IPC channel
     */
    static startupOnIPCMessage( child, messageData ){
        const _forkable = Object.keys( messageData )[0];
        msg.debug( 'coreForkable.startupOnIPCMessage()', messageData[_forkable].name, _forkable, messageData.event );
        coreForkable.startupOnIPCWriteRun( messageData );
        coreForkable.startupOnIPCForward( messageData );
    }

    /**
     * Write the JSON runfile for the newly forked child process
     * @param {Object} messageData the data transmitted by the forked process on startup
     * Note:
     *  This is a design decision to ask the parent to write the runfile for its child on 'startup' event.
     *  Doing that, we are sure that child is up and running when the runfile is written.
     */
    static startupOnIPCWriteRun( messageData ){
        if( messageData.event === 'startup' ){
            const _forkable = Object.keys( messageData )[0];
            coreRunfile.set( messageData[_forkable].name, _forkable, messageData[_forkable] );
        }
    }

    // the filled-up configuration passed-in at instanciation time
    _appConfig = null;
    _sceConfig = null;

    // the coreController name which manages this forkable
    _sceName = null;

    // service status
    _sceStatus = null;

    /**
     * @constructor
     * @param {string} sceName the name of the service
     * @param {Object} appConfig the application filled configuration
     * @param {Object} sceConfig the controller filled configuration
     * @returns {coreForkable}
     * @throws {coreError}
     * Note:
     *  As a reminder, the coreForkable is instanciated in its own run process
     *  (i.e. there is not instanciation in the main CLI process, the coreController is only instanciated
     *  in the controller process, and the coreBroker is only instanciated in the broker process).
     */
    constructor( sceName, appConfig, sceConfig ){
        if( !sceName || typeof sceName !== 'string' || !sceName.length ){
            throw new coreError( coreError.e.FORKABLE_NAMEUNSET );
        }
        if( !appConfig ){
            throw new coreError( coreError.e.FORKABLE_APPCONFUNSET );
        }
        if( !sceConfig ){
            throw new coreError( coreError.e.FORKABLE_CONTCONFUNSET );
        }
        msg.debug( 'instanciating new coreForkable() sceName='+sceName );
        this._appConfig = appConfig;
        this._sceConfig = sceConfig;
        this._sceName = sceName;
        this._sceStatus = coreForkable.s.STARTING;

        return this;
    }

    /**
     * An error handler for derived classes
     * @param {Error} e exception on TCP server listening
     * (child process)
     */
    errorHandler( e ){
        msg.debug( 'coreForkable:onErrorHandler() entering...' );
        if( e.stack ){
            msg.error( e.name, e.message );
        }
        // for now, do not terminate on ECONNRESET
        //if( e.code === 'ECONNRESET' ){
        //    return;
        //}
        // not very sure this is good idea !?
        if( this._sceStatus !== coreForkable.s.STOPPING ){
            msg.info( 'auto-killing on '+e.code+' error' );
            this._sceStatus = coreForkable.s.STOPPING;
            process.kill( process.pid, 'SIGTERM' );
            //process.kill( process.pid, 'SIGKILL' ); // if previous is not enough ?
        }
    }

    /**
     * Execute a command received on the TCP communication port
     * @param {string} cmd the received command, maybe with parameters
     * @param {Object} refs the commands known by the derived class (coreController/coreBroker)
     * @param {Callback} cb the callback to be called to send the answer
     *  cb will be called with ( result:Object ) arg.
     * @throws {coreError}
     */
    execute( cmd, refs, cb ){
        //msg.debug( 'cmd', cmd );
        //msg.debug( 'refs', refs );
        //msg.debug( 'refs.keys', Object.keys( refs ));
        if( !cmd || typeof cmd !== 'string' || !cmd.length ){
            throw new coreError( coreError.e.FORKABLE_CMDUNSET );
        }
        const _words = cmd.split( ' ' );
        //msg.debug( 'words', _words );
        if( !Object.keys( refs ).includes( _words[0] )){
            throw new coreError( coreError.e.FORKABLE_CMDUNKNOWN );
        }
        const _ocmd = refs[_words[0]];
        if( !_ocmd || !_ocmd.fn || typeof _ocmd.fn !== 'function' ){
            throw new coreError( coreError.e.FORKABLE_CMDNOTDEFINED );
        }
        _ocmd.fn( this, _words, cb );
        return _ocmd;
    }

    /**
     * @returns {Object} the filled application configuration passed-in at instanciation time
     */
    getAppConfig(){
        return this._appConfig;
    }

    /**
     * @returns {Object} the filled controller configuration passed-in at instanciation time
     */
    getServiceConfig(){
        return this._sceConfig;
    }

    /**
     * @returns {string} the name of the controller service
     */
    getName(){
        return this._sceName;
    }

    /**
     * Getter/Setter
     * @param {string} status the runtime status of the server
     * @returns the runtime status of the server
     */
    runningStatus( status ){
        if( status && typeof status === 'string' ){
            this._sceStatus = status;
        }
        return this._sceStatus;
    }

    /**
     * Send an IPC message to the parent when this (derived-class) server is ready
     * @param {integer} port the TCP port number this server is listening to
     * @param {string} message a Hello message to be written in the logfile
     * @param {*} data to be send to the parent, most probably a current status of the server
     * @throw {codeError}
     */
    startupAdvertiseParent( port, message, data ){
        if( this._sceStatus !== coreForkable.s.STOPPING ){
            let _procName = Iztiar.envForked();
            msg.debug( _procName+' advertising parent' );
            // unfortunately this try/catch doesn't handle Error [ERR_IPC_CHANNEL_CLOSED]: Channel closed
            //  triggered by process.send() in coreController/coreBroker processes when the parent has already terminated
            try {
                let _msg = { ...data };
                //console.log( 'data', data );
                _msg.event = 'startup';
                _msg[_procName].status = this.runningStatus( coreForkable.s.RUNNING );
                _msg[_procName].helloMessage = message;
                //console.log( '_msg', _msg );
                process.send( _msg );
                msg.info( 'coreForkable.startupAdvertiseParent() sends', _msg );
            } catch( e ){
                msg.error( e.name, e.message );
            }
        }
    }
}
