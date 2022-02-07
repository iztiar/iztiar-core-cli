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
     * @param {JSON} json the content of the JSON runfile
     * @param {boolean} withConsole whether display the actions to the console, or run in batch mode (no display, default)
     * @returns {Promise} a promise which will eventually resolves with a result or false
     * Note:
     *  Most of the done checks are asynchronous, and are implemented as Promises.
     *  Because we want to be able to use this same function to display the global status to the console,
     *  we have to take care of sequentializing the displays of messages, checks being running, and their results.
     *  As a consequence, all actions are implemented as Promises, and dynamically chained.
     * Note:
     *  The returned promise eventually resolves with:
     *  - either an error count (0, 1 or 2)
     *  - or a JSON object { forkable: full_status }
     */
    static checkServiceWithJson( name, json, withConsole=false ){
        coreLogger.debug( 'coreForkable.checkServiceWithJson()', 'name='+name );
        let _promise = Promise.resolve( true );
        let _alive = false;
        if( withConsole ){
            _promise = _promise.then(( res ) => { return utils.consoleLogPromise( 'Examining \''+name+'\' service' )});            
        }
        const _processes = coreRunfile.processesChecked( json );
        // get { forkable: { name, pid, port }} or error_message_string
        if( typeof _processes === 'string' ){
            if( withConsole ){
                _promise = _promise.then(( res ) => { return utils.consoleErrorPromise( '   '+_processes )});
            }
            _promise = _promise.then(( res ) => { return Promise.resolve( 1 )});
        } else {
            // local functions defined here to have access to _processes variable
            const _initProcessesPromise = function( forkable ){
                _processes[forkable].res = { pid:false, port:false, status:false };
                return Promise.resolve( true );
            };
            const _pidPromise = function( forkable, pid ){
                return new Promise(( resolve, reject ) => {
                    utils.isAlivePid( pid )
                        .then(( res ) => {
                            if( withConsole ){
                                if( res ){
                                    const _local = { user:res[0].user, time:res[0].time, elapsed:res[0].elapsed };
                                    console.log( '      pid='+pid+' is alive', _local );
                                } else {
                                    console.log( chalk.red( '      pid='+pid+' is dead' ));
                                }
                            }
                            if( res ){
                                _processes[forkable].res.pid = res;
                            } else {
                                _processes.errs += 1;
                            }
                            resolve( res );
                        });
                });
            };
            const _portPromise = function( forkable, port ){
                if( _processes[forkable].res.pid ){
                    return new Promise(( resolve, reject ) => {
                        utils.isAlivePort( port )
                            .then(( res ) => {
                                if( withConsole ){
                                    if( res ){
                                        console.log( '      port='+port+' answers', res );
                                    } else {
                                        console.log( chalk.red( '      port='+port+' doesn\'t answer' ));
                                    }
                                }
                                if( res ){
                                    _processes[forkable].res.port = res;
                                } else {
                                    _processes.errs += 1;
                                }
                                resolve( res );
                            });
                    });
                } else {
                    return Promise.resolve( false );
                }
            };
            const _statusPromise = function( forkable, port ){
                if( _processes[forkable].res.port ){
                    return new Promise(( resolve, reject ) => {
                        utils.tcpRequest( port, 'iz.status' )
                            .then(( res ) => {
                                if( withConsole ){
                                    if( res ){
                                        const _child = Object.keys( res )[0];
                                        const _local = { forkable:_child, status: res[_child].status, manager:res[_child].manager };
                                        console.log( '      statusOf answers', _local );
                                    } else {
                                        console.log( chalk.red( '      statusOf rejected' ));
                                    }
                                }
                                if( res ){
                                    _processes[forkable].res.status = res;
                                } else {
                                    _processes.errs += 1;
                                }
                                resolve( res );
                            });
                    });
                } else {
                    return Promise.resolve( false );
                }
            }
            const _processPromise = function(){
                return new Promise(( resolve, reject ) => {
                    //console.log( _processes );
                    if( _processes.errs > 0 ){
                        resolve( _processes.errs );
                    }
                    let _result = {};
                    for( const _forkable in _processes ){
                        if( _forkable !== 'errs' ){
                            _result[_forkable] = { ..._processes[_forkable].res.status };
                        }
                    }
                    resolve( _result );
                });
            };
            for( const _forkable in _processes ){
                _processes.errs = 0;
                if( withConsole ){
                    _promise = _promise.then(( res ) => { return utils.consoleLogPromise( '   '+ _forkable, _processes[_forkable] )});
                }
                _promise = _promise.then(( res ) => { return _initProcessesPromise( _forkable )});
                _promise = _promise.then(( res ) => { return _pidPromise( _forkable, _processes[_forkable].pid )});
                _promise = _promise.then(( res ) => { return _portPromise( _forkable, _processes[_forkable].port )});
                _promise = _promise.then(( res ) => { return _statusPromise( _forkable, _processes[_forkable].port )});
            }
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
        let _procName = Iztiar.envForked();
        coreLogger.debug( _procName+' advertising parent' );
        // unfortunately this try/catch doesn't handle Error [ERR_IPC_CHANNEL_CLOSED]: Channel closed
        //  triggered by process.send() in coreController/coreBroker processes when CLI main process has terminated on timeout
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
