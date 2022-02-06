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
import net from 'net';
import pidUsage from 'pidusage';

import { Iztiar, coreBroker, coreConfig, coreError, coreForkable, coreLogger, corePackage, coreRunfile } from './imports.js';

// cb is to be called with the result
//
function _izHelp( self, words, cb ){
    cb( coreController.c );
}

function _izPing( self, words, cb ){
    cb({ 'iz.ping': 'iz.ack' });
}

function _izStatus( self, words, cb ){
    //coreLogger.debug( 'in coreController._izStatus' );
    self.getStatus( cb );
}

function _izStop( self, words, cb ){
    self.startupTerminate( cb );
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
     * @returns {integer} the count of target we are going to start
     *  The count of targets includes:
     *  - maybe the attached coreBroker for this coreController
     *  - the managed coreControllers
     *  - maybe the coreBroker attached to each managed coreController
     */
    static startupComputeTargetsCount( sceConfig ){
        let _count = 1;                                        // this coreController
        _count += sceConfig.broker.enabled ? 1 : 0;            // the coreBroker attached to this coreController
        sceConfig.managed.every(( c ) => {
            const _conf = coreConfig.getControllerFilledConfig( c );
            _count += _conf.broker.enabled ? 2 : 1;
        });
        return _count;
    }

    // the communication TCP server
    _tcpServer = null;
    _tcpPort = null;

    // the managed coreControllers
    _managedControllers = [];

    // if this coreController is itself managed by another one, the manager's name
    _manager = '';

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
        coreLogger.debug( 'instanciating new coreController()' );
        this._tcpServer = null;
        this._tcpPort = sceConfig.controller.port;

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
        coreLogger.debug( 'coreController::startupStart()' );
        this._tcpServer = net.createServer(( c ) => {
            //coreLogger.debug( 'coreController::start() incoming connection' );
            //console.log( c );
            c.on( 'data', ( data ) => {
                //console.log( data );
                const _str = new Buffer.from( data ).toString();
                const _strs = _str.split( '\r\n' );
                const _req = _strs[0];
                coreLogger.info( 'server receives \''+_req+'\' request' );
                try {
                    const _ocmd = this.execute( _req, coreController.c, ( res ) => {
                        c.write( JSON.stringify( res )+'\r\n' );
                        coreLogger.info( 'server answers to \''+s+'\'' );
                    });
                } catch( e ){
                    coreLogger.error( 'coreController.startupStart() command management', e.name, e.message );
                    c.end();
                }
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });
        });
        this._tcpServer
            .listen( this._tcpPort, '0.0.0.0', () => {
                const msg = 'Hello, I am '+this.getName()+' '+Iztiar.envForked()+', running with pid '+process.pid+ ', listening on '+this._tcpPort;
                this.getStatus(( status ) => {
                    this.startupAdvertiseParent( this._tcpPort, msg, status );
                });
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
     * Make its best to advertise the main process of what it will do
     * (but be conscious that it will also close the connection rather soon)
     * @param {Callback} cb a (e,res) form callback called when all is terminated
     */
    startupTerminate( cb ){
        coreLogger.debug( 'coreController.startupTerminate() entering' );
        const _name = this.getName();

        // a function which exits the process when all is done
        const _terminate_process = function( cb ){
            if( cb && typeof cb === 'function' ){
                cb( 'terminated' );
            }
            const code = Iztiar.exitCode();
            coreLogger.info( 'coreController terminated', 'name='+_name,'code='+code );
            process.exit( code );
        }

        // what to do ?
        // close our server + may be a broker
        // note: call cb once with one array item per service with name:port
        let _count = 1;               
        const _brokerPort = coreBroker.getRuntimeControllerPort( this.getName());
        if( _brokerPort ){
            _count += 1;
            if( cb && typeof cb === 'function' ){
                cb({ servers: [{ name:'coreBroker', port:_brokerPort }]});
            }
        }
        coreLogger.debug( 'coreController.startupTerminate() about to terminate '+_count+' service(s)' );

        // hoping the message will arrive at its destination, then do the work
        this.runningStatus( coreForkable.s.STOPPING );

        // ask the broker to close itself 
        if( _brokerPort ){
            coreLogger.debug( 'coreController.startupTerminate() broker.port='+_brokerPort );
            coreForkable.requestAnswer( _port, 'iz.stop', ( e, res ) => {
                if( e ){
                    coreLogger.error( e.name, e.message );
                } else {
                    coreLogger.debug( 'coreController.startupTerminate() coreBroker answers ', res );
                    _count -= 1;
                    coreLogger.debug( 'coreController.startupTerminate() '+_count+' server(s) left' );
                    if( !_count ){
                        _terminate_process( cb );
                    }
                }
            });
        }

        // closing the TCP server
        if( this._tcpServer ){
            const self = this;
            this._tcpServer.close(() => {
                coreLogger.debug( 'coreController.startupTerminate() this._tcpServer is closed' );
                let code = 0;
                coreRunfile.remove( this.getName(), Iztiar.c.forkable.CONTROLLER );
                _count -= 1;
                coreLogger.debug( 'coreController.startupTerminate() '+_count+' server(s) left' );
                if( !_count ){
                    _terminate_process( cb );
                }
            });
        } else {
            coreLogger.warn( 'this._tcpServer is not set!' );
        }
    }
}
