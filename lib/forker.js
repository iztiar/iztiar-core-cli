/*
 * coreForker
 *  An companion class for forking process and managing relation parent/child
 * 
 *  As a primary goal, coreForker handles the forking options which let a parent asks for forking a child.
 *  It auto registers itself as the first handler to be called at startup; this is so a good time to
 *  set the ready flag.
 */

import { coreLogger } from "./imports.js";


    /*
     * Set the ready flag when the child has advertised of its startup.
     * @param {ChildProcess} child the forked process
     * @param {JSON} startupData the data transmitted by the forked process on startup
     * @param {Object} parms the coreForker object used by this parent
     */
    function _setReadyCb( child, startupData, parms ){
        parms.ready = true;
        coreLogger.debug( 'coreForker._setReadyCb() ready='+parms.ready );
    }

export class coreForker {

    /**
     * @param {string} forkable the identifier of the coreForkable class, valid values being:
     *  - Iztiar.c.forkable.BROKER
     *  - Iztiar.c.forkable.CONTROLLER
     */
    forkable = null;

    /**
     * @param {Array} handlers an Array of Objects which contain
     *  - cb a callback to be called when the child startup event is received
     *  - parms an arbitrary object, which is installed at registration time, and passed back to the cb
     * 
     * At startup time, the handlers are called on the same order as they were registered.
     * 
     * The cb callbacks will be called with the arguments:
     *  - child the NodeJs child process
     *  - data the data passed in by the child to advertise its parent of its startup
     *  - parms the parameters defined at registration time
     */
    handlers = [];

    /**
     * @param {bool} ready is set true by this forker as the first registered handler
     *  this flag is used by the cli-runner.js script to allow the main programm to exit.
     */
    ready = false;

    /**
     * @constructor
     * @param {string} forkable the identifier of the coreForkable class, valid values being:
     *  - Iztiar.c.forkable.BROKER
     *  - Iztiar.c.forkable.CONTROLLER
     */
    constructor( forkable ){
        coreLogger.debug( 'instanciating new coreForker() for '+forkable );
        this.forkable = forkable;
        this.registerHandler( _setReadyCb, this );
    }

    /**
     * @param {ChildProcess} child the forked process
     * @param {JSON} startupData the data transmitted by the forked process on startup
     */
    executeHandlers( child, startupData ){
        coreLogger.debug( 'coreForker.executeHandlers()' );
        this.handlers.every(( h ) => {
            if( h.cb && typeof h.cb === 'function' ){
                h.cb( child, startupData, h.parms );
            }
            return( true );
        });
    }

    /**
     * register a new callback handler
     * @param {callback} cb 
     * @param {*} parms 
     */
    registerHandler( cb, parms ){
        this.handlers.push({ cb:cb, parms:parms||null });
    }
}
