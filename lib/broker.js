/*
 * coreBroker
 *
 * The class is only instanciated and started in an already forked process.
 */
import Aedes from 'aedes';
import { createServer } from 'aedes-server-factory';

import { Iztiar, coreLogger, coreForkable, coreController } from './imports.js';

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
        coreLogger.debug( 'requesting for status on port '+port );
        coreForkable.requestAnswer( port, 'iz.status', cb );
    }

    _parent = null

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
        const _port = this.getConfig().broker.port;
        coreLogger.debug( 'coreBroker::start()' );
        this._parent = Aedes();                                     // instanciates the aedes broker
        this._server = createServer( this._parent, ( c ) => {       // instanciates a tcp server on top of the broker
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
                                });
                                break;
                            default:
                                const o = { code: coreForkable.e.UNKNOWN_COMMAND, command: s };
                                c.write( JSON.stringify( o )+'\r\n' );
                                break;
                        }
                    }
                    return( true );
                })
            });
        });
        this._server
            .listen( _port, '0.0.0.0', () => {
                this.advertiseParent( _port );
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });
    }
}
