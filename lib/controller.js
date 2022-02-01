/*
 * coreController
 *
 * There is at least one controller, but we may be able to have to manager several
 */
import net from 'net';
import path from 'path';

import { Iztiar, coreLogger, coreConfig, corePackage, coreForkable, utils } from './imports.js';

export class coreController extends coreForkable {

    /**
     * check whether a json run file is usable
     * we need:
     * - a listening port to communicate with it
     * - a pid to terminating it
     */
     static checkJsonRun( fname, json ){
        let res = false;
        if( json ){
            let key = Iztiar.c.forkable.CONTROLLER; 
            if( !json[key] ){
                key = Iztiar.c.forkable.BROKER;
                if( !json[key] ){
                    key = null;
                }
            }
            if( key ){
                if( json[key].listening && json[key].pid ){
                    res = true;
                }
            }
        }
        if( !res ){
            coreLogger.error( 'fname', fname, 'json', json, 'JSON is considered invalid' );
        }
        return res;
    }

    /**
     * Returns the options needed for forking a controller
     */
    static getForkOptions(){
        return {
            type: Iztiar.c.forkable.CONTROLLER,
            flowEnded: false,
            ready: false,
            cbExit: null,
            cbStartup: null,
            parent: null
        }
    }

    /**
     * 
     * @param {*} port 
     * @param {*} cb 
     */
    static getJsonPath( name ){
        return path.join( coreConfig.getPidDir(), coreConfig.getControllerRuntimeName( name )+'.json' );
    }

    /**
     * get the status of the controller identified by its listening tcp port
     *  callback is of the form ( error, result )
     */
    static statusOf( port, cb ){
        coreLogger.debug( 'requesting for coreController status on port '+port );
        coreForkable.requestAnswer( port, 'iz.status', cb );
    }

    _server = null;
    _brokers = [];

    // at instanciation time, get the runtime configuration of the controller
    //  read from stored json configuration, maybe superseded by the command-line
    constructor( config ){
        super( config );
        coreLogger.debug( 'instanciating new coreController()' );
        const self = this;

        // install signal handlers
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

    // return a JSON object with the status of this controller
    getStatus( cb ){
        let res = {};
        let config = this.getConfig();
        res[Iztiar.getProcName()] = {
            status: this.runningStatus(),
            config: config,
            storageDir: Iztiar.getStorageDir(),
            version: corePackage.getVersion(),
            environment: {
                iztiar: process.env.IZTIAR_ENV || 'undefined',
                node: process.env.NODE_ENV || 'undefined'
            },
            pid: process.pid,
            json: coreController.getJsonPath( config.controller.name )
        };
        cb( res );
    }

    /**
     * register the forked broker
     */
    registerBroker( child ){
        this._brokers.push( child );
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
                                this.getStatus(( res ) => {
                                    c.write( JSON.stringify( res )+'\r\n' );
                                    coreLogger.debug( 'server answers to \''+s+'\' request' );
                                });
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
                const msg = 'Hello, I am '+Iztiar.getProcName()+' '+config.controller.name+', running with pid '+process.pid+ ', listening on '+_port;
                this.advertiseParent( _port, msg );
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            })
            .on( 'data', ( data ) => {
                console.log( Iztiar.getProcName(), data );
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
                utils.jsonRemoveKeySync( coreController.getJsonPath( self.getConfig().controller.name ), Iztiar.c.forkable.CONTROLLER );
                self._brokers.every(( b ) => {
                    coreLogger.debug( 'sending SIGTERM to child '+b.pid );
                    process.kill( b.pid, 'SIGTERM' );
                    return true;
                });
                coreLogger.info( 'controller terminated with code '+code );
                process.exit( code );
            })
        }
    }
}
