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

import { Iztiar, coreForkable, coreForker, coreLogger, corePackage, coreRunfile } from './imports.js';

function _izHelp( self, words ){
    return coreController.c;
}

function _izStatus( self, words ){
    //coreLogger.debug( 'in coreController._izStatus' );
    return self.getStatus();
}

// handler registered on the main process: increment the count of received IPC messages
function _onIPCStartup( child, messageData, forker ){
    forker.ipcCount += 1;
    coreLogger.debug( '_onIPCStartup() set forker.ipcCount='+forker.ipcCount );
}

export class coreController extends coreForkable {

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
        'iz.status': {
            label: 'returns the status of the service',
            fn: _izStatus
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
        coreLogger.debug( 'coreController.onBrokerStartup()', messageData );
        process.send( messageData );
    }

    // the communication TCP server
    _server = null;

    /**
     * @constructor
     * @param {Object} config runtime configuration for the coreController
     *  read from stored json configuration, maybe superseded by the command-line
     * @returns {coreController}
     * @throws {coreResult}
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
     * @returns {Object} the status of the controller
     * (controller process)
     */
    getStatus(){
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
        return _result;
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
                            res = this.execute( s, coreController.c );
                            c.write( JSON.stringify( res )+'\r\n' );
                            coreLogger.info( 'server answers to \''+s+'\'' );
                        } catch( e ){
                            coreLogger.error( e );
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
                this.advertiseParent( _port, msg, this.getStatus());
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
     */
    terminate(){
        if( this._server ){
            coreLogger.debug( 'terminates the server' );
            this.runningStatus( coreForkable.s.STOPPING );

            // killing broker if any 
            const pid = this.runfile().getFor( Iztiar.c.forkable.BROKER, 'pid' );
            if( pid ){
                coreLogger.debug( 'sending SIGTERM to child '+pid );
                process.kill( pid, 'SIGTERM' );
            }

            // closing the TCP server
            if( this._server ){
                const self = this;
                this._server.close(() => {
                    let code = 0;
                    self.runfile().remove();
                    coreLogger.info( 'controller terminated with code '+code );
                    process.exit( code );
                })
            }
        }
    }
}
