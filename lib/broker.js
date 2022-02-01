/*
 * coreBroker
 *
 * The class is only instanciated and started in an already forked process.
 */
import net from 'net';
import Aedes from 'aedes';
import { createServer } from 'aedes-server-factory';

import { Iztiar, coreLogger, corePackage, coreForkable, coreController } from './imports.js';

export class coreBroker extends coreForkable {

    /**
     * Returns the options needed for forking a broker
     */
     static getForkOptions(){
        return {
            type: coreForkable.c.FORKABLE_BROKER,
            flowEnded: false,
            ready: false,
            cbExit: null,
            cbStartup: null,
            parent: null
        }
    }

    /**
     * get the status of the broker identified
     *  callback is of the form ( error, result )
     */
     static statusOf( port, cb ){
        coreLogger.debug( 'requesting for coreBroker status on port '+port );
        coreForkable.requestAnswer( port, 'iz.status', cb );
    }

    _mqttServer = null;
    _tcpServer = null;
    _count = 0;

    // we are listening on two ports:
    //  - one for communication with coreController
    //  - second for messaging
    //  advertise the parent only once
    _tryToAdvertise(){
        this._count += 1;
        if( this._count === 2 ){
            let msg = 'Hello, I am '+Iztiar.getProcName();
            const config = this.getConfig();
            msg += ' (managed by '+config.controller.name+' controller)';
            msg += ', running with pid '+process.pid+ ', listening ';
            msg += 'for controller communication on '+config.broker.controllerPort+', ';
            msg += 'for messaging on '+config.broker.messagingPort;
            this.advertiseParent( config.broker.controllerPort, msg );
        }
    }

    constructor( config ){
        super( config );
        coreLogger.debug( 'instanciating new coreBroker()' );
        return  this;
    }

    // return a JSON object with the status of this broker
    getStatus( cb ){
        let res = {};
        let config = this.getConfig();
        res[Iztiar.getProcName()] = {
            status: this.getRunningStatus(),
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

        this._tcpServer
            .listen( _cPort, '0.0.0.0', () => {
                this._tryToAdvertise();
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });
    }
}
