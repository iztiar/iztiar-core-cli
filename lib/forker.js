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
     * @param {Object} parms the parameters defined at registration time
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
     * Before being allow to exit, the main CLI process must wait for successful startup of ** two **
     *  level of subprocesses:
     *  1. main forks a coreController
     *  2. the coreController forks (perhaps) a coreBroker
     *  3a) the coreBroker advertises its coreController parent
     *  3b) the coreController advertises its main CLI parent
     * => both the 3a) and 3b) tasks must be completed
     * 
     * To be sure of that, the coreController will advertise the main CLI process two times:
     *  - first, when it has successfully startup its communication server
     *  - second when it receives the startup message from the broker.
     * 
     * And so, the main CLI process has to wait for two IPC messages.
     * 
     * @param {number} ipcTarget is set by the coreController to the count of IPC messages to be waited for
     *  before allow the main CLI process to exit:
     *  - 1 or 2 whether the coreBroker is enabled or not.
     * 
     * @param {number} ipcCount is incremented each time an IPC message is received.
     */
    ipcTarget = 0;
    ipcCount = 0;

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
        const _messageKeys = Object.keys( startupData );
        const _forkable = _messageKeys[0];
        const _event = startupData[_forkable].event;
        coreLogger.debug( 'coreForker.executeHandlers() for \''+_event+'\' event' );
        let _count = 0;
        let _total = 0;
        this.handlers.every(( h ) => {
            _total += 1;
            if(( h.event === 'ALL' || h.event === _event ) && h.cb && typeof h.cb === 'function' ){
                h.cb( child, startupData, h.parms );
                _count += 1;
            }
            return( true );
        });
        coreLogger.debug( 'coreForker.executeHandlers() '+_count+'/'+_total+' executed' );
    }

    /**
     * register a new callback handler
     * @param {string|null} event the event for which this handler must be triggered (all events if 'ALL')
     * @param {callback} cb 
     * @param {*} parms 
     */
    registerHandler( event, cb, parms ){
        this.handlers.push({ event:event, cb:cb, parms:parms||null });
    }
}
