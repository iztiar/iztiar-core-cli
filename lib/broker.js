/*
 * coreBroker
 *
 * The class is only instanciated and started in an already forked process.
 */
import net from 'net';
import Aedes from 'aedes';
import { createServer } from 'aedes-server-factory';

import { Iztiar, coreForkable, coreForker, coreLogger, corePackage, coreRunfile } from './imports.js';

export class coreBroker extends coreForkable {

    /**
     * the cliStart() asks the coreBroker to provide back its fork options
     * @returns {coreForker} the options needed for forking a controller
     */
    static getForker(){
        let forker = new coreForker( Iztiar.c.forkable.BROKER );
        forker.registerHandler( coreForkable.onStartup );
        return forker;
    }

    /**
     * get the status of the broker identified
     *  callback is of the form ( error, result )
     */
     static statusOf( port, cb ){
        coreLogger.debug( 'requesting for coreBroker status on port '+port );
        coreForkable.requestAnswer( port, 'iz.status', cb );
    }

    // message aedes-based server
    _mqttServer = null;

    // communication server
    _tcpServer = null;

    // internal servers count on start/stop
    _count = 0;

    // we are listening on two ports:
    //  - one for communication with coreController
    //  - second for messaging
    //  advertise the parent only once
    _tryToAdvertise(){
        this._count += 1;
        if( this._count >= 2 ){
            let msg = 'Hello, I am '+Iztiar.envForked();
            const config = this.getConfig();
            msg += ' (managed by '+config.controller.name+' controller)';
            msg += ', running with pid '+process.pid+ ', listening ';
            msg += 'for controller communication on '+config.broker.controllerPort+', ';
            msg += 'for messaging on '+config.broker.messagingPort;
            this.advertiseParent( config.broker.controllerPort, msg );
        }
    }

    _tryToTerminate(){
        this._count += 1;
        if( this._count >= 2 ){
            let code = 0;
            this.runfile.remove();
            coreLogger.info( 'broker terminated with code '+code );
            process.exit( code );
        }
    }

    /**
     * @constructor
     * @param {Object} config runtime configuration for the coreBroker
     *  read from stored json configuration, maybe superseded by the command-line
     * @returns {coreBroker}
     * @throws {coreResult}
     * Note:
     *  As a reminder, the coreBroker is instanciated in its own run process, i.e. only in the broker process.
     */
     constructor( config ){
        super( config );
        coreLogger.debug( 'instanciating new coreBroker()' );
        this.runfile( new coreRunfile( this.getName(), Iztiar.c.forkable.BROKER ));

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

        return  this;
    }

    // return a JSON object with the status of this broker
    getStatus(){
        let _result = {};
        let _config = this.getConfig();
        _result[Iztiar.envForked()] = {
            config: _config,
            environment: {
                IZTIAR_ENV: process.env.IZTIAR_ENV || 'undefined',
                NODE_ENV: process.env.NODE_ENV || 'undefined'
            },
            json: this.runfile().fname(),
            listening: _config.broker.controllerPort,
            pid: process.pid,
            status: this.runningStatus(),
            storageDir: Iztiar.getStorageDir(),
            version: corePackage.getVersion()
        };
        return _result;
    }

    // the public method
    //  as of Node.js v14, cannot listen on both ipv4 and ipv6
    start(){
        coreLogger.debug( 'coreBroker::start()' );
        const config = this.getConfig();
        const _cPort = config.broker.controllerPort;
        const _mPort = config.broker.messagingPort;
        this._count = 0;


        // - start the mqtt broker

        let aedes = new Aedes.Server();
        this._mqttServer = createServer( aedes );

        this._mqttServer
            .listen( _mPort, '0.0.0.0', () => {
                this._tryToAdvertise();
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });

        // - start the tcp server for coreController communication

        this._tcpServer = net.createServer(( c ) => {
            c.on( 'data', ( data ) => {
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

        this._tcpServer
            .listen( _cPort, '0.0.0.0', () => {
                this._tryToAdvertise();
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });
    }

    /**
     * terminate the servers
     */
    terminate(){
        this._count = 0;
        const self = this;
        this.runningStatus( coreForkable.s.STOPPING );
        if( this._tcpServer ){
            coreLogger.debug( 'terminates the communication server' );
            this._tcpServer.close(() => {
                self._tryToTerminate();
            })
        } else {
            this._count += 1;
        }
        if( this._mqttServer ){
            coreLogger.debug( 'terminates the messaging server' );
            this._mqttServer.close(() => {
                self._tryToTerminate();
            })
        } else {
            this._count += 1;
        }
        this._tryToTerminate();
    }
}
