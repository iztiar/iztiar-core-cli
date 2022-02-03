/*
 * coreController
 *
 * There is at least one controller, but we may be able to have to manage several ones
 * 
 * Note:
 *  The IPC communication channel initiated by Node.Js at fork time is only used to advertise
 *  the main CLI process of the good startup of the forked coreController.
 *  Once advertised, the main CLI process is allowed to terminates, and the IPC communication
 *  channel deads.
 *  As a consequence, all communications to and from the coreController pass through the TCP
 *  listening port.
 */
import net from 'net';
import pidUsage from 'pidusage';
import ut from 'util';

import { Iztiar, coreForkable, coreForker, coreLogger, corePackage, corePromise, coreRunfile } from './imports.js';

// cb is to be called with the result
//
function _izHelp( self, words, cb ){
    cb( coreController.c );
}

function _izStatus( self, words, cb ){
    //coreLogger.debug( 'in coreController._izStatus' );
    self.getStatus( cb );
}

function _izStop( self, words, cb ){
    self.terminate( cb );
}

// handler registered on the main process: increment the count of received IPC messages
function _onIPCStartup( child, messageData, forker ){
    forker.ipcCount += 1;
    coreLogger.debug( '_onIPCStartup() set forker.ipcCount='+forker.ipcCount );
}

export class coreController extends coreForkable {

    /**
     * The commands which can be received by the coreController via the TCP communication port
     * - keys are the commands
     *   > label {string} a short help message
     *   > fn: {Function} the execution function (cf. above)
     *   > answer {boolean} whether the client may expect an answer
     */
     static c = {
        'iz.help': {
            label: 'returns the list of known commands',
            fn: _izHelp,
            answer: true
        },
        'iz.broker.start': {
            label: 'start the broker (to be done)',
            fn: null,
            answer: true
        },
        'iz.broker.stop': {
            label: 'stop the broker (to be done)',
            fn: null,
            answer: false
        },
        'iz.broker.restart': {
            label: 'restart the broker (to be done)',
            fn: null,
            answer: true
        },
        'iz.status': {
            label: 'returns the status of the service',
            fn: _izStatus,
            answer: true
        },
        'iz.stop': {
            label: 'stop this coreController and all attached services',
            fn: _izStop,
            answer: false
        }
    };

    /**
     * the cliStart() asks the coreController to provide back its fork options
     * @param {coreConfig} config the runtime configuration
     * @returns {coreForker} the options needed for forking a controller
     */
    static getForker( config ){
        let forker = new coreForker( Iztiar.c.forkable.CONTROLLER );

        // the main CLI process must wait nonly for the first process coreController has forked,
        //  but also that the second process coreForker has advertised its startup
        forker.ipcTarget = 1;
        if( !Iztiar.envForked()){
            if( config.broker.enabled ){
                forker.ipcTarget += 1;
            }
            forker.registerHandler( 'ALL', _onIPCStartup, forker );
        }

        // this will write the JSON runfile
        forker.registerHandler( 'startup', coreForkable.onStartup );

        return forker;
    }

    /**
     * handler registered in the coreController process in the coreBroker forker
     * forward the coreBroker startup message
     */
    static onBrokerStartup( child, messageData, parms ){
        const _messageKeys = Object.keys( messageData );
        const _forkable = _messageKeys[0];
        messageData[_forkable].event  = 'forward';
        coreLogger.debug( 'coreController.onBrokerStartup() forwarding the received startup message from coreBroker' );
        process.send( messageData );
    }

    // the communication TCP server
    _server = null;

    /**
     * @constructor
     * @param {Object} config runtime configuration for the coreController
     *  read from stored json configuration, maybe superseded by the command-line
     * @returns {coreController}
     * Note:
     *  As a reminder, the coreController is instanciated in its own run process, i.e. only
     *  in the controller process.
     */
     constructor( config ){
        super( config );
        coreLogger.debug( 'instanciating new coreController()' );
        this.runfile( new coreRunfile( this.getName(), Iztiar.c.forkable.CONTROLLER ));

        // install signal handlers
        const self = this;
        process.on( 'SIGUSR1', () => {
            coreLogger.debug( 'USR1 signal handler' );
        });

        process.on( 'SIGUSR2', () => {
            coreLogger.debug( 'USR2 signal handler' );
        });

        process.on( 'SIGTERM', () => {
            coreLogger.debug( 'receives SIGTERM signal' );
            self.terminate();
        });

        process.on( 'SIGHUP', () => {
            coreLogger.debug( 'HUP signal handler' );
        });

        process.on( 'SIGQUIT', () => {
            coreLogger.debug( 'QUIT signal handler' );
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
        let _result = {};
        const _config = this.getConfig();
        _result[Iztiar.envForked()] = {
            config: _config,
            environment: {
                IZTIAR_DEBUG: process.env.IZTIAR_DEBUG || '(undefined)',
                IZTIAR_ENV: process.env.IZTIAR_ENV || '(undefined)',
                NODE_ENV: process.env.NODE_ENV || '(undefined)',
                coreForkable: Iztiar.envForked()
            },
            listening: _config.controller.port,
            logfile: coreLogger.logFile(),
            loglevel: coreLogger.logLevel(),
            pid: process.pid,
            run: this.runfile().fname(),
            status: this.runningStatus(),
            storageDir: Iztiar.storageDir(),
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
    start(){
        coreLogger.debug( 'coreController::start()' );
        const config = this.getConfig();
        const self = this;
        this._server = net.createServer(( c ) => {
            // may receive several commands/informations in each message
            //  answer with a json per command/information
            //  so a c.write() occurrence per non-empty received command in the buffer
            //coreLogger.debug( 'coreController::start() incoming connection' );
            //console.log( c );
            c.on( 'data', ( data ) => {
                //console.log( data );
                const _str = new Buffer.from( data ).toString();
                const _strs = _str.split( '\r\n' );
                let res = null;
                _strs.every(( s ) => {
                    if( s && s.length ){
                        coreLogger.info( 'server receives \''+s+'\' request' );
                        try {
                            this.execute( s, coreController.c, ( res ) => {
                                c.write( JSON.stringify( res )+'\r\n' );
                                coreLogger.info( 'server answers to \''+s+'\'' );
                            });
                        } catch( e ){
                            coreLogger.error( e.name, e.message );
                            c.end();
                        }
                    }
                    return( true );
                })
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });
        });
        const _port = config.controller.port;
        this._server
            .listen( _port, '0.0.0.0', () => {
                const msg = 'Hello, I am '+Iztiar.envForked()+' '+config.controller.name+', running with pid '+process.pid+ ', listening on '+_port;
                this.getStatus(( status ) => {
                    this.advertiseParent( _port, msg, status );
                })
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            })
            .on( 'data', ( data ) => {
                console.log( Iztiar.envForked(), data );
            });
    }

    /**
     * terminate the server
     * @param {Callback} cb a (e,res) form callback called when all is terminated
     */
    terminate( cb ){
        coreLogger.debug( 'terminate() entering' );
        if( this._server ){
            this.runningStatus( coreForkable.s.STOPPING );
            let _count = 1;

            // ask the broker to close itself 
            const _port = this.runfile().getFor( Iztiar.c.forkable.BROKER, 'listening' );
            coreLogger.debug( 'terminate() broker.port='+_port );
            if( _port ){
                _count += 1;
                coreForkable.requestAnswer( _port, 'iz.stop', ( e, res ) => {
                    if( e ){
                        coreLogger.error( e.name, e.message );
                    } else {
                        coreLogger.debug( 'terminate() coreBroker answers ', res );
                        _count -= 1;
                        if( !_count && cb ){
                            cb( 'terminated' );
                        }
                    }
                });
            }

            // closing the TCP server
            const self = this;
            this._server.close(() => {
                coreLogger.debug( 'terminate() thisServer closed' );
                let code = 0;
                self.runfile().remove();
                _count -= 1;
                if( !_count && cb ){
                    cb( 'terminated' );
                }
                coreLogger.info( 'controller terminated with code '+code );
                process.exit( code );
            });
        } else {
            coreLogger.warn( 'this._server is null' );
        }
    }
}
