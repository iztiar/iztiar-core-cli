/*
 * coreBroker
 *
 * The class is only instanciated and started in an already forked process.
 */
import net from 'net';
import Aedes from 'aedes';
import { createServer } from 'aedes-server-factory';
import pidUsage from 'pidusage';

import { Iztiar, coreConfig, coreForkable, coreLogger, corePackage, coreRunfile } from './imports.js';

function _izHelp( self, words ){
    return coreBroker.c;
}

function _izPing( self, words, cb ){
    cb({ 'iz.ping': 'iz.ack' });
}

function _izStatus( self, words, cb ){
    //coreLogger.debug( 'in coreController._izStatus' );
    self.getStatus( cb );
}

function _izStop( self, words, cb ){
    //coreLogger.debug( 'in coreController._izStatus' );
    self.startupTerminate( cb );
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
        'iz.ping': {
            label: 'ping the service',
            fn: _izPing
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
     * @param {string} name the name of the manager coreController
     * @returns {integer} the communication port number between this coreBroker and its coreController
     *  Read from runfile
     * @throws {coreError}
     */
    static getRuntimeControllerPort( name ){
        const _json = coreRunfile.byName( name );
        let _port = 0;
        if( Object.keys( _json ).includes( Iztiar.c.forkable.BROKER )){
            const _broker = _json[Iztiar.c.forkable.BROKER];
            if( _broker && _broker.controller && _broker.controller.port ){
                _port = _broker.controller.port;
            }
        }
        return _port;
    }

    // message aedes-based server
    _mqttServer = null;
    _mqttPort = null;
    _aedes = null;

    // communication server
    _tcpServer = null;
    _tcpPort = null;

    // internal servers count on start/stop
    _targetCount = 2;
    _startedCount = 0;

    // we are listening on two ports:
    //  - one for communication with coreController
    //  - second for messaging
    //  advertise the parent only once, so when the two servers are listening
    _tryToAdvertise(){
        this._startedCount += 1;
        if( this._startedCount === this._targetCount ){
            let msg = 'Hello, I am '+Iztiar.envForked()+' (managed by '+this.getName()+' controller)';
            msg += ', running with pid '+process.pid+ ', listening ';
            msg += 'for controller communication on '+this._tcpPort+', ';
            msg += 'for messaging on '+this._mqttPort;
            this.getStatus(( status ) => {
                this.startupAdvertiseParent( this._tcpPort, msg, status );
            });
            
        }
    }

    _tryToTerminate(){
        this._startedCount -= 1;
        if( this._startedCount === 0 ){
            let code = Iztiar.exitCode();
            coreRunfile.remove( this.getName(), Iztiar.c.forkable.BROKER );
            coreLogger.info( 'broker terminated with code '+code );
            process.exit( code );
        }
    }

    /**
     * @constructor
     * @param {string} sceName the name of the service
     * @param {Object} appConfig the application filled configuration
     * @param {Object} sceConfig the controller filled configuration
     * @returns {coreBroker}
     * Note:
     *  As a reminder, the coreBroker is instanciated in its own run process, i.e. only in the broker process.
     */
     constructor( sceName, appConfig, sceConfig ){
        super( sceName, appConfig, sceConfig );
        coreLogger.debug( 'instanciating new coreBroker()' );
        this._tcpServer = null;
        this._tcpPort = sceConfig.broker.controller.port;
        this._mqttServer = null;
        this._mqttPort = sceConfig.broker.messaging.port;


        // as soon as we have a coreBroker, then we are managing two servers
        this._targetCount = 2;
        this._startedCount = 0;

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
            self.startupTerminate();
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
        const _sceConfig = this.getServiceConfig();
        let _result = {};
        _result[Iztiar.envForked()] = {};   // expected to the first key when inspecting messages
        _result.name = this.getName();
        _result[Iztiar.envForked()] = {
            // this process
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
            // this broker
            messaging: {
                port: this._mqttPort
            },
            // manager
            manager: this.getName(),
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
     * Startup the broker servers
     * Note:
     *  As of Node.js v14, cannot listen on both ipv4 and ipv6
     */
    startupStart(){
        coreLogger.debug( 'coreBroker.startupStart()' );
        const _config = this.getServiceConfig();

        // - start the mqtt broker

        if( !this._aedes ){
            this._aedes = new Aedes.Server();
        }
        if( !this._mqttServer ){
            this._mqttServer = createServer( this._aedes );
        }
        this._mqttServer
            .listen( this._mqttPort, '0.0.0.0', () => {
                this._tryToAdvertise();
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });

        // - start the tcp server for coreController communication
        //   we coud have stay stucked with the initial IPC communication channel setup by Node.Js at fork time
        //   we build this TCP channel to be consistent with the way controller works and manages other servers

        if( !this._tcpServer ){
            this._tcpServer = net.createServer(( c ) => {
                c.on( 'data', ( data ) => {
                    const _str = new Buffer.from( data ).toString();
                    const _strs = _str.split( '\r\n' );
                    const _req = _strs[0];
                    coreLogger.info( 'server receives \''+_req+'\' request' );
                    try {
                        const _ocmd = this.execute( _req, coreBroker.c, ( res ) => {
                            c.write( JSON.stringify( res )+'\r\n' );
                            coreLogger.info( 'server answers to \''+s+'\'' );
                        });
                    } catch( e ){
                        coreLogger.error( 'coreBroker.startupStart() command management', e.name, e.message );
                        c.end();
                    }
                })
                .on( 'error', ( e ) => {
                    this.errorHandler( e );
                });
            });
        }
        this._tcpServer
            .listen( this._tcpPort, '0.0.0.0', () => {
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
    startupTerminate( cb ){
        const self = this;

        if( cb && typeof cb === 'function' ){
            cb({ answer:'iz.ack' });
        }

        this.runningStatus( coreForkable.s.STOPPING );
        
        // stopping the messaging server

        if( !this._aedes ){
            coreLogger.warn( 'messaging subserver is not set' );
        } else {
            coreLogger.info( 'terminates the messaging subserver' );
            this._aedes.close(() => {
                coreLogger.info( 'messaging subserver successfully stopped' );
                this._aedes = null;
            })
        }

        if( !this._mqttServer ){
            coreLogger.warn( 'messaging server is not set' );
        } else {
            coreLogger.info( 'terminates the messaging server' );
            this._mqttServer.close(() => {
                coreLogger.info( 'messaging server successfully stopped' );
                self._tryToTerminate();
            })
        }

        // stopping the communication server

        if( !this._tcpServer ){
            coreLogger.warn( 'communication server is not set' );
        } else {
            coreLogger.info( 'terminates the communication server' );
            this._tcpServer.close(() => {
                coreLogger.info( 'communication server successfully stopped' );
                self._tryToTerminate();
            })
        }
    }
}
