/*
 * coreForkable
 */
import chalk from 'chalk';
import cp from 'child_process';

import { Iztiar, coreConfig, coreError, coreLogger, coreRunfile, utils } from './imports.js';

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
        coreLogger.debug( 'coreForkable.checkServiceByName()', 'name='+name, 'withConsole='+withConsole );
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
     *  Most of the done checks are asynchronous, and are implemented as Promises.
     *  Because we want to be able to use this same function to display the global status to the console,
     *  we have to take care of sequentializing the displays of messages, running checks, and their results.
     *  As a consequence, all actions are implemented as Promises, and dynamically chained here.
     */
    static checkServiceWithJson( name, json, withConsole=false ){
        coreLogger.debug( 'coreForkable.checkServiceWithJson()', 'name='+name );
        let _promise = Promise.resolve( true );
        let _result = { reasons:[], startable:true, pids:[], ports:[], status:{} };
        if( withConsole ){
            _promise = _promise.then(( res ) => { return utils.consoleLogPromise( 'Examining \''+name+'\' service' )});            
        }
        if( name === 'ALL' ){
            let _msg = coreError.e.NAME_ALL_INVALID;
            if( withConsole ){
                _promise = _promise.then(( res ) => { return utils.consoleErrorPromise( '   '+_msg )});            
            }
            _result.startable = false;
            _result.reasons.push( _msg );
            _promise = _promise.then(( res ) => { return Promise.resolve( _result )});
        }
        // the runfile content is empty or is not present: the only case where the service is startable (unless invalid name)
        if( !json || !Object.keys( json ).length ){
            if( withConsole ){
                _promise = _promise.then(( res ) => { return utils.consoleErrorPromise( ' '+coreError.e.RUNFILE_NOTFOUNDOREMPTY )});
            }
            _result.reasons.push( coreError.e.RUNFILE_NOTFOUNDOREMPTY );
            _promise = _promise.then(( res ) => { return Promise.resolve( _result )});
        } else {
            _result.startable = false;
            const _processes = coreRunfile.processesFromJson( json );
            // get { forkable: { name, pid, port }} or error_message_string
            if( _processes.errs.length ){
                if( withConsole ){
                    _processes.errs.every(( msg ) => {
                        _promise = _promise.then(( res ) => { return utils.consoleErrorPromise( ' '+msg )});
                        return true;
                    });
                }
                _result.reasons.push( ..._processes.errs );
                _promise = _promise.then(( res ) => { return Promise.resolve( true )});
            }
            // local functions defined here to have access to _processes variable
            const _pidPromise = function( forkable, pid ){
                if( !pid ){
                    _result.reasons.push( 'pid not checked as not present' );
                    return Promise.resolve( true );
                } else {
                    return new Promise(( resolve, reject ) => {
                        utils.isAlivePid( pid )
                            .then(( res ) => {
                                let _msg = null;
                                if( res ){
                                    _result.pids.push( pid );
                                } else {
                                    _msg = 'pid='+pid+' is dead';
                                    _result.reasons.push( _msg );
                                }
                                if( withConsole ){
                                    if( res ){
                                        const _local = { user:res[0].user, time:res[0].time, elapsed:res[0].elapsed };
                                        console.log( '  pid='+pid+' is alive', _local );
                                    } else {
                                        console.log( chalk.red( '  '+_msg ));
                                    }
                                }
                                resolve( true );
                            });
                    });
                }
            };
            const _portPromise = function( forkable, port ){
                if( !port ){
                    _result.reasons.push( 'communication not checked as port not present' );
                    return Promise.resolve( true );
                } else {
                    return new Promise(( resolve, reject ) => {
                        utils.isAlivePort( port )
                            .then(( res ) => {
                                let _msg = null;
                                if( res ){
                                    _result.ports.push( port );
                                } else {
                                    _msg = 'port='+port+' doesn\'t answer to ping';
                                    _result.reasons.push( _msg );
                                }
                                if( withConsole ){
                                    if( res ){
                                        console.log( '  port='+port+' answers', res );
                                    } else {
                                        console.log( chalk.red( '  '+_msg ));
                                    }
                                }
                                resolve( true );
                            });
                    });
                }
            };
            const _statusPromise = function( forkable, port ){
                if( !port ){
                    _result.reasons.push( 'status not requested as port not present' );
                    return Promise.resolve( true );
                } else {
                    return new Promise(( resolve, reject ) => {
                        utils.tcpRequest( port, 'iz.status' )
                            .then(( res ) => {
                                let _answerName = null;
                                let _answerPid = 0;
                                let _answerManager = null;
                                let _msg = [];
                                if( res ){
                                    _answerName = Object.keys( res )[0];
                                    _answerPid = res[_answerName].pid;
                                    _answerManager = res[_answerName].manager;
                                    if( _answerName === forkable ){
                                        _result.status[forkable] = res[_answerName];
                                        if( _answerName === Iztiar.c.forkable.BROKER ){
                                            if( _answerManager !== name ){
                                                _msg.push( 'statusOf answers with \''+_answerManager+'\' manager while \''+name+'\' was expected' );
                                            }
                                        }
                                    } else {
                                        _msg.push( 'statusOf answers from '+_answerName+' while '+forkable+' was expected' );
                                    }
                                    if( _answerPid !== _processes[forkable].pid ){
                                        _msg.push( 'statusOf answers from pid='+_answerPid+' while pid='+_processes[forkable].pid+' was expected' );
                                    }
                                } else {
                                    _msg.push( 'statusOf request rejected' );
                                }
                                _result.reasons.push( ..._msg );
                                if( withConsole ){
                                    if( res ){
                                        const _child = Object.keys( res )[0];
                                        const _local = { forkable:_answerName, pid:res[_answerName].pid, manager:_answerManager };
                                        console.log( '  statusOf answers', _local );
                                    }
                                    if( _msg.length ){
                                        _msg.every(( m ) => {
                                            console.log( chalk.red( '  '+m ));
                                            return true;
                                        })
                                    }
                                }
                                resolve( true );
                            }, ( rej ) => {
                                let _msg = 'statusOf request rejected';
                                _result.reasons.push( _msg );
                                if( withConsole ){
                                    console.log( chalk.red( '  '+_msg ));
                                }
                                resolve( true );
                            });
                    });
                }
            }
            const _hasController = function(){
                return new Promise(( resolve, reject ) => {
                    if( !Object.keys( _processes ).includes( Iztiar.c.forkable.CONTROLLER )){
                        let _msg = 'coreController not found';
                        _result.reasons.push( _msg );
                        if( withConsole ){
                            console.log( chalk.red( '  '+_msg ));
                        }
                    }
                    resolve( true );
                });
            };
            // resolve with 'result' to send back to the caller
            const _processPromise = function(){
                return new Promise(( resolve, reject ) => {
                    //console.log( '_processes', _processes );
                    //console.log( 'reasons.length=', _result.reasons.length );
                    //console.log( '_result', _result );
                    resolve( _result );
                });
            };
            // should be at least a coreController, maybe a coreBroker
            for( const _forkable in _processes ){
                if( _forkable === 'errs' ){
                    continue;
                }
                if( withConsole ){
                    _promise = _promise.then(( res ) => { return utils.consoleLogPromise( ' '+ _forkable, _processes[_forkable] )});
                }
                _promise = _promise.then(( res ) => { return _pidPromise( _forkable, _processes[_forkable].pid )});
                _promise = _promise.then(( res ) => { return _portPromise( _forkable, _processes[_forkable].port )});
                _promise = _promise.then(( res ) => { return _statusPromise( _forkable, _processes[_forkable].port )});
            }
            _promise = _promise.then(( res ) => { return _hasController()});
            _promise = _promise.then(( res ) => { return _processPromise()});
        }
        return _promise;
    }

    /**
     * fork this process
     *  actually re-running our same CLI command in a dedicated environment
     *  (parent process)
     * @param {string} forkable the forkable to fork
     * @param {Callback} ipcCallback a ( child, messageData ) callback to be triggered when receiving IPC messages
     * @returns {ChidlProcess} the forked child process
     * 
     * Note:
     *  Node.js sets up a communication channel between the parent process and the forked child process.
     *  child.send( message ) is received on the callback below.
     *  Unfortunately this means that the parent has to stay running. which is not what we want
     *  (at least in the coreController case).
     *  So, the IPC channel is mainly used for advertising the parent of the startup event.
     * 
     * Note:
     *  Execute in parent process.
     */
    static startupFork( forkable, ipcCallback ){
        coreLogger.debug( 'coreForkable::startupFork() about to fork '+forkable );
        const _path = process.argv[1];
        let _args = process.argv;
        _args.shift();
        _args.shift();
        let _env = {
            ...process.env
        };
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
     *  parent the IPC messages which are received from managed coreController(s) and coreBroker.
     *  The hierarchy is said flat because managed coreController(s) cannot manage themselves
     *  other coreControllers. So there is only one level.
     * 
     * @param {Object} messageData 
     */
     static startupOnIPCForward( messageData ){
        if( Iztiar.envForked() === Iztiar.c.forkable.CONTROLLER && messageData.event === 'startup' ){
            coreLogger.debug( 'coreForkable.startupOnIPCForward()', 'forwarding' );
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
        coreLogger.debug( 'coreForkable.startupOnIPCMessage()', messageData[_forkable].name, _forkable, messageData.event );
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
        coreLogger.debug( 'instanciating new coreForkable() sceName='+sceName );
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
        coreLogger.debug( 'coreForkable:onErrorHandler() entering...' );
        if( e.stack ){
            coreLogger.error( e.name, e.message );
        }
        // for now, do not terminate on ECONNRESET
        //if( e.code === 'ECONNRESET' ){
        //    return;
        //}
        // not very sure this is good idea !?
        if( this._sceStatus !== coreForkable.s.STOPPING ){
            coreLogger.info( 'auto-killing on '+e.code+' error' );
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
        //coreLogger.debug( 'cmd', cmd );
        //coreLogger.debug( 'refs', refs );
        //coreLogger.debug( 'refs.keys', Object.keys( refs ));
        if( !cmd || typeof cmd !== 'string' || !cmd.length ){
            throw new coreError( coreError.e.FORKABLE_CMDUNSET );
        }
        const _words = cmd.split( ' ' );
        //coreLogger.debug( 'words', _words );
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
            coreLogger.debug( _procName+' advertising parent' );
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
                coreLogger.info( 'coreForkable.startupAdvertiseParent() sends', _msg );
            } catch( e ){
                coreLogger.error( e.name, e.message );
            }
        }
    }
}
