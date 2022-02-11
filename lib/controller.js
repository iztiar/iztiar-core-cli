/*
 * coreController
 *  There is at least one coreController.
 * 
 * Note:
 *  The IPC communication channel initiated by Node.Js at fork time is only used to advertise
 *  the main CLI process of the good startup of the forked coreController.
 *  Once advertised, the main CLI process is allowed to terminates, and the IPC communication
 *  channel deads.
 *  As a consequence, all communications to and from the coreController pass through the TCP
 *  listening port.
 * 
 * Runtime configuration
 *  The runtime configuration is slavishly copied from the controller configuration:
 *  - controller
 *      port {integer} the listening port of the controller (from configuration or command-line)
 *      pid {integer} the pid of the (forked) process (from runtime)
 *  - broker
 *      enabled {boolean} whether a coreBroker is attached to this controller (from configuration or command-line)
 *      controller
 *          port {integer} the communication (with the controller) listening port (from configuration or command-line)
 *      messaging
 *          port {integer} the messaging listening port (from configuration or command-line)
 *  - managed {string[]} an array of the named of managed controllers (from configuration or runtime)
 *  - manager {string} name of the manager controller (from configuration or command-line)
 */
import chalk from 'chalk';
import net from 'net';
import { resolve } from 'path';
import pidUsage from 'pidusage';
import { moveCursor } from 'readline';

import { Iztiar, coreBroker, coreCmdline, coreConfig, coreError, coreForkable, coreLogger, corePackage, coreRunfile, msg, utils } from './imports.js';

// cb is to be called with the result
//  the connexion will be closed after execution of the callback - only one answer is allowed
//
//  returns the list of available commands
function _izHelp( self, words, cb ){
    cb( coreController.c );
}

// ping -> ack: the port is alive
function _izPing( self, words, cb ){
    cb({ 'iz.ping': 'iz.ack' });
}

// returns the full status of the server
function _izStatus( self, words, cb ){
    self.getStatus( cb );
}

// terminate the server and its relatives (broker, managed, plugins)
//  the cb is called with a '<name> <forkable> terminated with code <code>' message
function _izStop( self, words, cb ){
    self.startupTerminate( words, cb );
}

export class coreController extends coreForkable {

    /**
     * The commands which can be received by the coreController via the TCP communication port
     * - keys are the commands
     *   > label {string} a short help message
     *   > fn: {Function} the execution function (cf. above)
     */
     static c = {
        'iz.help': {
            label: 'returns the list of known commands',
            fn: _izHelp
        },
        'iz.broker.start': {
            label: 'start the broker (to be done)',
            fn: null
        },
        'iz.broker.stop': {
            label: 'stop the broker (to be done)',
            fn: null
        },
        'iz.broker.restart': {
            label: 'restart the broker (to be done)',
            fn: null
        },
        'iz.ping': {
            label: 'ping the service',
            fn: _izPing
        },
        'iz.status': {
            label: 'returns the status of the service',
            fn: _izStatus
        },
        'iz.stop': {
            label: 'stop this coreController and all attached services',
            fn: _izStop
        }
    };

    /**
     * We expect to receive, not only the startup messages of the server(s) we start ourselves, 
     *  but also the forwarded startup messages from server(s) started by the formers
     *  (knowing that we manage only a one-level hierarchy)
     * 
     * @param {Object} sceConfig the filled runtime service configuration
     * @param {integer} level recursion level, starting with zero, max=1
     * @returns {integer} the count of target we are going to start
     *  The count of targets includes:
     *  - maybe the attached coreBroker for this coreController
     *  - the managed coreControllers
     *  - maybe the coreBroker attached to each managed coreController
     * @throws {coreError}
     */
    static startupComputeTargetsCount( name, sceConfig, level=0, count=0 ){
        msg.debug( 'coreController.startupComputeTargetsCount()', 'name='+name, 'entering with level='+level, 'count='+count );
        if( level > 1 ){
            throw new coreError( coreError.e.CONTROLLER_RECURSION );
        }
        count += 1;                                         // this coreController
        msg.debug( 'coreController.startupComputeTargetsCount()', 'name='+name, 'level='+level, 'coreController count='+count );
        count += sceConfig.broker.enabled ? 1 : 0;          // the coreBroker attached to this coreController
        msg.debug( 'coreController.startupComputeTargetsCount()', 'name='+name, 'level='+level, 'attached coreBroker count='+count );
        if( level === 0 ){
            sceConfig.managed.every(( c ) => {
                let _conf = coreConfig.getControllerFilledConfig( c );
                count = coreController.startupComputeTargetsCount( c, _conf, 1+level, count );
                return true;
            });
        } else if( sceConfig.managed.length ){
            msg.warn( 'coreController.startupComputeTargetsCount()', name+' coreController is configured to managed sub-controllers, will be ignored here' );
        }
        return count;
    }

    // the communication TCP server
    _tcpServer = null;
    _tcpPort = null;

    // the managed coreControllers
    _managedControllers = [];

    // if this coreController is itself managed by another one, the manager's name
    _manager = '';

    // when stopping, the port to which forward the received messages
    _forwardPort = null;

    /**
     * @constructor
     * @param {string} sceName the name of the service
     * @param {Object} appConfig the application filled configuration
     * @param {Object} sceConfig the controller filled configuration
     * @returns {coreController}
     * Note:
     *  As a reminder, the coreController is instanciated in its own run process, i.e. only
     *  in the controller process.
     */
     constructor( sceName, appConfig, sceConfig ){
        super( sceName, appConfig, sceConfig );
        msg.debug( 'instanciating new coreController()' );
        this._tcpServer = null;
        this._tcpPort = sceConfig.controller.port;
        this._manager = sceConfig.manager;
        this._forwardPort = 0;

        // install signal handlers
        const self = this;
        process.on( 'SIGUSR1', () => {
            msg.debug( 'USR1 signal handler' );
        });

        process.on( 'SIGUSR2', () => {
            msg.debug( 'USR2 signal handler' );
        });

        process.on( 'SIGTERM', () => {
            msg.debug( 'receives SIGTERM signal' );
            self.startupTerminate();
        });

        process.on( 'SIGHUP', () => {
            msg.debug( 'HUP signal handler' );
        });

        process.on( 'SIGQUIT', () => {
            msg.debug( 'QUIT signal handler' );
        });

        return this;
    }

    /**
     * Status is sent first to the parent when advertising it of the good startup,
     *  and then as the answer to each 'iz.status' received command.
     * @param {Callback} cb the callback to be called when the status is ready
     *  cb mus be of the form cb( {Object} )
     * (controller process)
     */
    getStatus( cb ){
        const _sceConfig = this.getServiceConfig();
        let _result = {};
        _result[Iztiar.envForked()] = {
            // this process
            name: this.getName(),
            pid: process.pid,
            port: this._tcpPort,
            status: this.runningStatus(),
            // running environment
            environment: {
                IZTIAR_DEBUG: process.env.IZTIAR_DEBUG || '(undefined)',
                IZTIAR_ENV: process.env.IZTIAR_ENV || '(undefined)',
                NODE_ENV: process.env.NODE_ENV || '(undefined)',
                coreForkable: Iztiar.envForked()
            },
            // broker
            broker: {
                enabled: _sceConfig.broker.enabled
            },
            // managed controllers
            managed: this._managedControllers,
            // manager
            manager: this._manager,
            // general runtime constants
            logfile: coreLogger.logFile(),
            runfile: coreRunfile.runFile( this.getName()),
            storageDir: coreConfig.storageDir(),
            version: corePackage.getVersion()
        };
        pidUsage( process.pid, ( e, res ) => {
            _result[Iztiar.envForked()].pidUsage = {
                cpu: res.cpu,
                memory: res.memory,
                ctime: res.ctime,
                elapsed: res.elapsed
            }
            cb( _result );
        });
    }

    /**
     * Startup the named controller server
     * Note:
     *  As of Node.js v14, cannot listen on both ipv4 and ipv6
     */
    startupStart(){
        msg.debug( 'coreController::startupStart()' );
        this._tcpServer = net.createServer(( c ) => {
            msg.debug( 'coreController::startupStart() incoming connection' );
            //console.log( c );
            c.on( 'data', ( data ) => {
                //console.log( data );
                const _bufferStr = new Buffer.from( data ).toString();
                msg.info( 'server receives \''+_bufferStr+'\' request' );
                const _words = _bufferStr.split( ' ' );
                if( _words[0] === Iztiar.c.app.stop.command ){
                    if( this._forwardPort ){
                        utils.tcpRequest( this._forwardPort, _bufferStr )
                            .then(( res ) => {
                                c.write( JSON.stringify( res ));
                                msg.info( 'server answers to \''+_bufferStr+'\' with', res );
                                c.end();
                            })
                    } else {
                        msg.error( 'coreController.startupStart().on(\''+Iztiar.c.app.stop.command+'\') unexpected forwardPort='+this._forwardPort );
                    }
                } else {
                    try {
                        const _ocmd = this.execute( _bufferStr, coreController.c, ( res ) => {
                            c.write( JSON.stringify( res ));
                            msg.info( 'server answers to \''+_bufferStr+'\' with', res );
                            c.end();
                        });
                    } catch( e ){
                        msg.error( 'coreController.startupStart().execute()', e.name, e.message );
                        c.end();
                    }
                }
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });
        });
        this._tcpServer.listen( this._tcpPort, '0.0.0.0', () => {
            const msg = 'Hello, I am '+this.getName()+' '+Iztiar.envForked()+', running with pid '+process.pid+ ', listening on '+this._tcpPort;
            this.startupSubProcesses();
            this.getStatus(( status ) => {
                this.startupAdvertiseParent( this._tcpPort, msg, status );
            });
        });
    }

    /**
     * Startup the coreBroker (if any) and managed coreControllers
     */
     startupSubProcesses(){
        const _sceConfig = this.getServiceConfig();
        const _sceName = this.getName();

        // fork the message bus broker if not prevented from
        if( _sceConfig.broker.enabled ){
            console.log( ' - ('+_sceName+' coreController) requesting for attached coreBroker to start...' );
            coreForkable.startupFork( Iztiar.c.forkable.BROKER, coreForkable.startupOnIPCMessage );
        }

        // starts the managed controllers (each one being able to maybe run a coreBroker (even if useless))
        msg.debug( 'startupSubProcesses() managed', _sceConfig.managed );
        if( coreCmdline.options().manager ){
            if( _sceConfig.managed.lengh ){
                let _msg = _sceConfig.managed.lengh+' managed coreControllers are configured,';
                _msg += 'will be ignored here as this coreController is already a managed one';
                msg.warn( 'coreController.startupSubProcesses()', _msg );
                console.log( chalk.yellow( '   '+_msg ));
            }
        } else {
            _sceConfig.managed.every(( c ) => {
                console.log( ' - ('+_sceName+' coreController) requesting for '+c+' coreController to start...' );
                let _args = [ ...process.argv ];
                for( let i=0 ; i<_args.length ; ++i ){
                    if( _args[i] === _sceName ){
                        _args[i] = c;
                    }
                }
                _args.push( '--manager' );
                _args.push( _sceName );
                this._managedControllers.push( c );
                msg.debug( 'coreController.startupSubProcesses()', 'process.argv', process.argv, 'args', _args );
                coreForkable.startupFork( Iztiar.c.forkable.CONTROLLER, coreForkable.startupOnIPCMessage, _args );
                return true;
            });
        }
    }

    /**
     * terminate the server
     * Does its best to advertise the main process of what it will do
     * (but be conscious that it will also close the connection rather soon)
     * @param {string[]|null} words the parameters transmitted after the 'iz.stop' command
     * @param {Callback|null} cb a (e,res) form callback called when all is terminated
     */
     startupTerminate( words, cb ){
        msg.debug( 'coreController.startupTerminate() entering' );
        const self = this;
        const _name = this.getName();
        this._forwardPort = words && words[0] && utils.isInt( words[0] ) ? words[0] : 0;

        // remove our key from JSON runfile as soon as we become Stopping..
        this.runningStatus( coreForkable.s.STOPPING );
        coreRunfile.remove( this.getName(), Iztiar.c.forkable.CONTROLLER );

        // a function to send a message to the requester
        /*
        const _toRequester = function( message ){
            msg.debug( 'coreController.terminate().toRequester', 'parentPort='+_parentPort, message );
            if( _parentPort ){
                utils.tcpSend( _parentPort, message );
            }
        }
        */

        // before terminating our own coreController, we have to
        //  - terminate managed coreControllers (if any) to terminate themselves
        //  - terminate our coreBroker (if any)
        //  - terminate our plugins (see you soon ;))
        // for each of these operations, we send a message to parentPort which is expected to listen to them

        let _promises = [];

        // the managed coreControllers
        const _managedPromise = function( port ){
            return new Promise(( resolve, reject ) => {
                utils.tcpRequest( port, 'iz.stop '+self._tcpPort )
                    .then(( res ) => { return utils.tcpRequest( self._forwardPort, Iztiar.c.app.stop.command+' '+JSON.stringify( res ))})
                    .then(() => {
                        resolve( true );
                    })
                    .catch(( e ) => { msg.error( 'coreController.startupTerminate().managedPromise()', e.name, e.message )});
            });
        };
        this._managedControllers.every(( n ) => {
            const _mc = coreRunfile.getController( n ) || {};
            if( utils.isInt( _mc.port )){
                _promises.push( _managedPromise( _mc.port ));
            }
            return true;
        });

        // the coreBroker
        const _brokerPromise = function( port ){
            return new Promise(( resolve, reject ) => {
                utils.tcpRequest( port, 'iz.stop' )
                    .then(( res ) => { return utils.tcpRequest( self._forwardPort, Iztiar.c.app.stop.command+' '+JSON.stringify( res ))})
                    .then(() => {
                        resolve( true );
                    })
                    .catch(( e ) => { msg.error( 'coreController.startupTerminate().brokerPromise()', e.name, e.message )});
            });
        };
        const _broker = coreRunfile.getBroker( _name ) || {};
        if( utils.isInt( _broker.port )){
            _promises.push( _brokerPromise( _broker.port ));
        }

        // closing the TCP server
        //  in order the TCP server be closeable, the current connection has to be ended itself
        //  which is done by calling cb()
        Promise.all( _promises )
            .then(() => {
                return new Promise(( resolve, reject ) => {
                    if( self._tcpServer ){
                        if( cb && typeof cb === 'function' ){ 
                            cb({ name:_name, forkable:Iztiar.c.forkable.CONTROLLER, pid:process.pid, port:this._tcpPort, manager:self._manager });
                        }
                        self._tcpServer.close(() => {
                            msg.debug( 'coreController.startupTerminate() this._tcpServer is closed' );
                            resolve( true );
                        });
                    } else {
                        msg.warn( 'this._tcpServer is not set!' );
                        resolve( true );
                    }
                });
            })
            .then(() => {
                msg.info( _name+' coreController terminating with code '+process.exitCode );
                //process.exit();
            });
    }
}
