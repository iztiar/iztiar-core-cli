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

export class coreController extends coreForkable {

    /**
     * the cliStart() asks the coreController to provide back its fork options
     * @returns {coreForker} the options needed for forking a controller
     */
    static getForker(){
        let forker = new coreForker( Iztiar.c.forkable.CONTROLLER );
        forker.registerHandler( coreForkable.onStartup );
       return forker;
    }

    /**
     * get the status of the controller identified by its listening tcp port
     *  callback is of the form ( error, result )
     */
    static statusOf( port, cb ){
        coreLogger.debug( 'requesting for coreController status on port '+port );
        coreForkable.requestAnswer( port, 'iz.status', cb );
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
     * @returns {JSON} a object which contains the status of the controller
     * (controller process)
     */
    getStatus(){
        let _result = {};
        const _config = this.getConfig();
        _result[Iztiar.envForked()] = {
            config: _config,
            environment: {
                IZTIAR_ENV: process.env.IZTIAR_ENV || 'undefined',
                NODE_ENV: process.env.NODE_ENV || 'undefined'
            },
            json: this.runfile().fname(),
            listening: _config.controller.port,
            pid: process.pid,
            status: this.runningStatus(),
            storageDir: Iztiar.getStorageDir(),
            version: corePackage.getVersion()
        };
        return _result;
    }

    // start the named controller
    //  as of Node.js v14, cannot listen on both ipv4 and ipv6
    start(){
        coreLogger.debug( 'coreController::start()' );
        const config = this.getConfig();
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
                _strs.every(( s ) => {
                    if( s && s.length ){
                        coreLogger.debug( 'server receives \''+s+'\' request' );
                        switch( s ){
                            case 'iz.status':
                                const result = this.getStatus();
                                c.write( JSON.stringify( result )+'\r\n' );
                                coreLogger.debug( 'server answers to \''+s+'\' request' );
                                break;
                            default:
                                const o = { code: coreForkable.e.UNKNOWN_COMMAND, command: s };
                                c.write( JSON.stringify( o )+'\r\n' );
                                coreLogger.debug( 'server complains about \''+s+'\' unkown request' );
                                break;
                        }
                    }
                    return( true );
                })
            });
        });
        const _port = config.controller.port;
        this._server
            .listen( _port, '0.0.0.0', () => {
                const msg = 'Hello, I am '+Iztiar.envForked()+' '+config.controller.name+', running with pid '+process.pid+ ', listening on '+_port;
                this.advertiseParent( _port, msg );
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
            const self = this;
            this.runningStatus( coreForkable.s.STOPPING );
            this._server.close(() => {
                let code = 0;
                self._runfile.remove();
                /*
                self._brokers.every(( b ) => {
                    coreLogger.debug( 'sending SIGTERM to child '+b.pid );
                    process.kill( b.pid, 'SIGTERM' );
                    return true;
                });
                */
                coreLogger.info( 'controller terminated with code '+code );
                process.exit( code );
            })
        }
    }
}
