/*
 * coreBroker
 *
 * The class is only instanciated and started in an already forked process.
 */
import net from 'net';
import Aedes from 'aedes';
import { createServer } from 'aedes-server-factory';
import pidUsage from 'pidusage';

import { Iztiar, coreForkable, coreForker, coreLogger, corePackage, coreRunfile } from './imports.js';

function _izHelp( self, words ){
    return coreBroker.c;
}

function _izStatus( self, words, cb ){
    //coreLogger.debug( 'in coreController._izStatus' );
    self.getStatus( cb );
}

function _izStop( self, words, cb ){
    //coreLogger.debug( 'in coreController._izStatus' );
    self.terminate( cb );
}

export class coreBroker extends coreForkable {

    /**
     * The commands which can be received from the coreController via the TCP communication port
     * - keys are the commands
     *   > label {string} a short help message
     *   > fn: {Function} the execution function (cf. above)
     */
    static c = {
        'iz.help': {
            label: 'returns the list of known commands',
            fn: null
        },
        'iz.status': {
            label: 'returns the status of the service',
            fn: _izStatus
        },
        'iz.stop': {
            label: 'returns the status of the service',
            fn: _izStop
        }
    };

    /**
     * the cliStart() asks the coreBroker to provide back its fork options
     * @param {coreConfig} config the runtime configuration
     * @returns {coreForker} the options needed for forking a controller
     */
    static getForker( config ){
        let forker = new coreForker( Iztiar.c.forkable.BROKER );
        forker.registerHandler( 'startup', coreForkable.onStartup );
        return forker;
    }

    // message aedes-based server
    _mqttServer = null;
    _aedes = null;

    // communication server
    _tcpServer = null;

    // internal servers count on start/stop
    _serversCount = 0;
    _count = 0;

    // we are listening on two ports:
    //  - one for communication with coreController
    //  - second for messaging
    //  advertise the parent only once, so when the two servers are listening
    _tryToAdvertise(){
        this._count += 1;
        if( this._count === this.serversCount ){
            const _config = this.getConfig();
            let msg = 'Hello, I am '+Iztiar.envForked()+' (managed by '+_config.controller.name+' controller)';
            msg += ', running with pid '+process.pid+ ', listening ';
            msg += 'for controller communication on '+_config.broker.controllerPort+', ';
            msg += 'for messaging on '+_config.broker.messagingPort;
            this.getStatus(( status ) => {
                this.advertiseParent( _config.broker.controllerPort, msg, status );
            });
            
        }
    }

    _tryToTerminate(){
        this._count += 1;
        if( this._count === this.serversCount ){
            let code = 0;
            this.runfile().remove();
            coreLogger.info( 'broker terminated with code '+code );
            process.exit( code );
        }
    }

    /**
     * @constructor
     * @param {Object} config runtime configuration for the coreBroker
     *  read from stored json configuration, maybe superseded by the command-line
     * @returns {coreBroker}
     * Note:
     *  As a reminder, the coreBroker is instanciated in its own run process, i.e. only in the broker process.
     */
     constructor( config ){
        super( config );
        coreLogger.debug( 'instanciating new coreBroker()' );
        this.runfile( new coreRunfile( this.getName(), Iztiar.c.forkable.BROKER ));

        // as soon as we have a coreBroker, then we are managing two servers
        this.serversCount = 2;

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

    /**
     * Status is sent first to the parent when advertising it of the good startup,
     *  and then as the answer to each 'iz.status' received command.
     * @param {Callback} cb the callback to be called when the status is ready
     *  cb mus be of the form cb( {Object} )
     */
    getStatus( cb ){
        let _result = {};
        let _config = this.getConfig();
        _result[Iztiar.envForked()] = {
            config: _config,
            environment: {
                IZTIAR_DEBUG: process.env.IZTIAR_DEBUG || '(undefined)',
                IZTIAR_ENV: process.env.IZTIAR_ENV || '(undefined)',
                NODE_ENV: process.env.NODE_ENV || '(undefined)',
                coreForkable: Iztiar.envForked()
            },
            listening: _config.broker.controllerPort,
            logfile: coreLogger.logFile(),
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
     * Startup the broker servers
     * Note:
     *  As of Node.js v14, cannot listen on both ipv4 and ipv6
     */
    start(){
        coreLogger.debug( 'coreBroker::start()' );
        const config = this.getConfig();
        const _cPort = config.broker.controllerPort;
        const _mPort = config.broker.messagingPort;
        this._count = 0;

        // - start the mqtt broker

        this._aedes = new Aedes.Server();
        this._mqttServer = createServer( this._aedes );
        this._mqttServer
            .listen( _mPort, '0.0.0.0', () => {
                this._tryToAdvertise();
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });

        // - start the tcp server for coreController communication
        //   we coud have stay stucked with the initial IPC communication channel setup by Node.Js at fork time
        //   we build this TCP channel to be consistent with the way controller works and manages other servers

        this._tcpServer = net.createServer(( c ) => {
            c.on( 'data', ( data ) => {
                const _str = new Buffer.from( data ).toString();
                const _strs = _str.split( '\r\n' );
                let res = null;
                _strs.every(( s ) => {
                    if( s && s.length ){
                        coreLogger.info( 'server receives \''+s+'\' request' );
                        try {
                            const _ocmd = this.execute( s, coreBroker.c, ( res ) => {
                                c.write( JSON.stringify( res )+'\r\n' );
                                coreLogger.info( 'server answers to \''+s+'\'' );
                            });
                        } catch( e ){
                            coreLogger.error( 'coreBroker.start() command management', e.name, e.message );
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
     * Because this is a signal handler, we cannot set here the exit code of the process :(
     */
    terminate( cb ){
        this._count = 0;
        const self = this;
        cb({ answer:'OK' });

        this.runningStatus( coreForkable.s.STOPPING );
        
        // stopping the messaging server

        coreLogger.info( 'terminates the messaging subserver' );
        this._aedes.close(() => {
            coreLogger.info( 'messaging subserver successfully stopped' );
        })

        coreLogger.info( 'terminates the messaging server' );
        this._mqttServer.close(() => {
            coreLogger.info( 'messaging server successfully stopped' );
            self._tryToTerminate();
        })

        // stopping the communication server

        coreLogger.info( 'terminates the communication server' );
        this._tcpServer.close(() => {
            coreLogger.info( 'communication server successfully stopped' );
            self._tryToTerminate();
        })
    }
}
