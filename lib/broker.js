/*
 * coreBroker
 *
 * The class is only instanciated and started in an already forked process.
 */
import Aedes from 'aedes';
import { createServer } from 'aedes-server-factory';

import { coreForkable } from './forkable.js';
import { coreLogger } from './logger.js';

export class coreBroker extends coreForkable {

    static defaults = {
        port: 24002
    };

    _parent = null

    constructor( config ){
        super( config );
        coreLogger.debug( 'instanciating new coreBroker()' );
        return  this;
    }

    // the public method
    start(){
        coreLogger.debug( 'coreBroker::start()' );
        this._parent = Aedes();                             // instanciates the aedes broker
        this._server = createServer( this._parent );        // instanciates a tcp server on top of the broker
        this._server.listen( this._config.broker.port, () => {
            this.advertiseParent();
        }).on( 'error', ( e ) => {
            this.errorHandler( e );
        });
    }
}
