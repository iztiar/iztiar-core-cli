/*
 * coreBroker
 *
 * The class is only instanciated and started in an already forked process.
 */
import Aedes from 'aedes';
import { createServer } from 'aedes-server-factory';

import { coreLogger, coreForkable } from './imports.js';

export class coreBroker extends coreForkable {

    static async _req( child ){
        try {
            const client = net.createConnection( port, () => {
                client.write( 'iz.status\r\n' );
            });
            client.on( 'data', ( data ) => {
                const _str = new Buffer.from( data ).toString();
                const _strs = _str.split( '\r\n' );
                let _jsons = [];
                _strs.every(( s ) => {
                    if( s && s.length ){
                        _jsons.push( JSON.parse( s ));
                    }
                    return true;
                });
                let _res = {};
                _jsons.every(( o ) => {
                    _res = {
                        ..._res,
                        ...o
                    };
                });
                cb( null, _res );
                client.end();
            });
        } catch( e ){
            cb( e, null );
        }
    }

    // returns the status of this broker
    //  this must be a sync/blocking function as the caller waits for answering status request
    static getBrokerStatus( child, cb ){
        return {};
    }

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

    _parent = null

    constructor( config ){
        super( config );
        coreLogger.debug( 'instanciating new coreBroker()' );
        return  this;
    }

    // the public method
    //  as of Node.js v14, cannot listen on both ipv4 and ipv6
    start(){
        const _port = this.getConfig().broker.port;
        coreLogger.debug( 'coreBroker::start()' );
        this._parent = Aedes();                             // instanciates the aedes broker
        this._server = createServer( this._parent );        // instanciates a tcp server on top of the broker
        this._server
            .listen( _port, '0.0.0.0', () => {
                this.advertiseParent( _port );
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            });
    }
}
