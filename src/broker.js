/*
 * coreBroker
 *
 * The class is only instanciated and started in an already forked process.
 */
import net from 'net';
import Aedes from 'aedes';
import { createServer } from 'aedes-server-factory';
import pidUsage from 'pidusage';

import { Iztiar, coreConfig, coreForkable, coreLogger, corePackage, coreRunfile, msg } from './imports.js';

// cb is to be called with the result
//  the connexion will be closed after execution of the callback - only one answer is allowed
//
//  returns the list of available commands
function _izHelp( self, words ){
    return coreBroker.c;
}

// ping -> ack: the port is alive
function _izPing( self, words, cb ){
    cb({ 'iz.ping': 'iz.ack' });
}

// returns the full status of the server
function _izStatus( self, words, cb ){
    //msg.debug( 'in coreController._izStatus' );
    self.getStatus( cb );
}

// terminate the server and its relatives (broker, managed, plugins)
//  the cb is called with a '<name> <forkable> terminated with code <code>' message
function _izStop( self, words, cb ){
    self.startupTerminate( words, cb );
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

    // message aedes-based servers
    //  aedes: messaging subserver
    //  mqtt: messaging server
    _mqttServer = null;
    _mqttPort = null;
    _aedes = null;

    // communication server
    _tcpServer = null;
    _tcpPort = null;

    // internal servers count on start/stop
    _targetCount = 2;
    _startedCount = 0;

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
        msg.debug( 'instanciating new coreBroker()' );
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
            msg.debug( 'USR1 signal handled' );
        });

        process.on( 'SIGUSR2', () => {
            msg.debug( 'USR2 signal handled' );
        });

        process.on( 'SIGTERM', () => {
            msg.debug( 'receives SIGTERM signal' );
            self.startupTerminate();
        });

        process.on( 'SIGHUP', () => {
            msg.debug( 'HUP signal handled' );
        });

        process.on( 'SIGQUIT', () => {
            msg.debug( 'QUIT signal handled' );
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
        msg.debug( 'coreBroker.startupStart()' );
        const _config = this.getServiceConfig();

        // we are listening on two ports:
        //  - one for communication with coreController
        //  - second for messaging
        //  advertise the parent only once, so when the two servers are listening
        const _tryToAdvertise = function( self ){
            self._startedCount += 1;
            if( self._startedCount === self._targetCount ){
                let _msg = 'Hello, I am '+Iztiar.envForked()+' (managed by '+self.getName()+' controller)';
                _msg += ', running with pid '+process.pid+ ', listening ';
                _msg += 'for controller communication on '+self._tcpPort+', ';
                _msg += 'for messaging on '+self._mqttPort;
                self.getStatus(( status ) => {
                    self.startupAdvertiseParent( self._tcpPort, _msg, status );
                });
                
            }
        };

        // - start aedes aka messaging subserver
        // - start mqtt aka messaging server

        if( !this._aedes ){
            this._aedes = new Aedes.Server();
        }
        if( !this._mqttServer ){
            this._mqttServer = createServer( this._aedes );
        }
        this._mqttServer
            .listen( this._mqttPort, '0.0.0.0', () => {
                _tryToAdvertise( this );
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });

        // - start the tcp server for coreController communication aka communication server
        //   we coud have stay stucked with the initial IPC communication channel setup by Node.Js at fork time
        //   we build this TCP channel to be consistent with the way controller works and manages other servers

        if( !this._tcpServer ){
            this._tcpServer = net.createServer(( c ) => {
                msg.debug( 'coreBroker::startupStart() incoming connection' );
                c.on( 'data', ( data ) => {
                    const _bufferStr = new Buffer.from( data ).toString();
                    msg.info( 'server receives \''+_bufferStr+'\' request' );
                    try {
                        const _ocmd = this.execute( _bufferStr, coreBroker.c, ( res ) => {
                            c.write( JSON.stringify( res ));
                            msg.info( 'server answers to \''+_bufferStr+'\' with', res );
                            c.end();
                        });
                    } catch( e ){
                        msg.error( 'coreBroker.startupStart().execute()', e.name, e.message );
                        c.end();
                    }
                })
                .on( 'error', ( e ) => {
                    this.errorHandler( e );
                });
            });
        }
        this._tcpServer.listen( this._tcpPort, '0.0.0.0', () => {
            _tryToAdvertise( this );
        });
    }

    /**
     * Terminate the servers
     * @param {string[]|null} words the parameters transmitted after the 'iz.stop' command (that we don't care here)
     * @param {Callback|null} cb a (e,res) form callback called when all is terminated
     * Note:
     *  We have three servers to be terminated:
     *  - the aedes messaging subserver
     *  - the mqtt messaging server
     *  - the tcp communication server
     * The tcp connenction is kept alive (opened) while the cb() callback has not been called
     *  as this is the answer to the received tcp request. The cb() callback must so be called
     *  before trying to close the tcp communication server.
     */
    startupTerminate( words, cb ){
        msg.debug( 'coreBroker.startupTerminate() entering' );
        const _name = this.getName();
        const self = this;

        // remove our key from JSON runfile as soon as we become Stopping..
        this.runningStatus( coreForkable.s.STOPPING );
        coreRunfile.remove( this.getName(), Iztiar.c.forkable.BROKER );
    
        // stopping the messaging subserver
        const _messagingSubserverPromise = function(){
            return new Promise(( resolve, reject ) => {
                if( !self._aedes ){
                    msg.warn( 'messaging subserver is not set' );
                    resolve( true );
                } else {
                    msg.info( 'terminates the messaging subserver' );
                    self._aedes.close(() => {
                        msg.info( 'messaging subserver successfully stopped' );
                        self._aedes = null;
                        resolve (true );
                    })
                }
            });
        }

        // stopping the messaging server
        const _messagingServerPromise = function(){
            return new Promise(( resolve, reject ) => {
                if( !self._mqttServer ){
                    msg.warn( 'messaging server is not set' );
                    resolve( true );
                } else {
                    msg.info( 'terminates the messaging server' );
                    self._mqttServer.close(() => {
                        msg.info( 'messaging server successfully stopped' );
                        resolve( true );
                    })
                }
            });
        }
        let _messagingPromise = Promise.resolve( true )
            .then(() => { return _messagingSubserverPromise()})
            .then(() => { return _messagingServerPromise()})
            .then(() => { self._startedCount -= 1; return Promise.resolve( true )});

        // stopping the communication server
        const _communicationServerPromise = function(){
            return new Promise(( resolve, reject ) => {
                if( !self._tcpServer ){
                    msg.warn( 'communication server is not set' );
                    resolve( true );
                } else {
                    msg.info( 'terminates the communication server' );
                    if( cb && typeof cb === 'function' ){
                        cb({ name:_name, forkable:Iztiar.c.forkable.BROKER, pid:process.pid, port:self._tcpPort, manager:_name });
                    }
                    self._tcpServer.close(() => {
                        msg.info( 'communication server successfully stopped' );
                        resolve( true );
                    })
                }
            });
        }
        let _communicationPromise = Promise.resolve( true )
            .then(() => { return _communicationServerPromise()})
            .then(() => { self._startedCount -= 1; return Promise.resolve( true )});

        Promise.all([ _messagingPromise, _communicationPromise ])
            .then(() => {
                msg.debug( 'coreBroker.startupTerminate().Promise.all.then()', 'startedCount='+self._startedCount );
                if( self._startedCount === 0 ){
                    msg.info( _name+' coreBroker terminating with code '+process.exitCode );
                    //process.exit();
                }
            });
    }
}
