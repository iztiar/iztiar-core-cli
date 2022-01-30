/*
 * cli-start.js

 * Starts a controller
 * If not prevented against, the controller will then startup its message bus broker.
 * 
 * See also cmdline.js for a more detailed rationale.
 */
import { coreBroker } from './broker.js';
import { coreController } from './controller.js';
import { coreForkable } from './forkable.js';
import { coreLogger } from './logger.js';
import { Iztiar } from './global.js';

export function coreStart( name, cb ){

    // get the applicable configuration
    let _config = Iztiar.rt.config.getControllerRuntimeConfig( name );
    coreLogger.debug( 'coreStart() config %o', _config );
    //coreLogger.debug( 'coreStart() isTTY=', process.stdout.isTTY );  // always TRUE
    let controller = null;
    let broker = null;

    // startup the controller
    // if we are in the main process, then ask to fork
    if( !process.env[coreForkable.id] ){
        coreForkable.fork( coreForkable.c.FORKABLE_CONTROLLER, cb );

    // if we are in a forked process dedicated to this task, then go
    } else if( process.env[coreForkable.id] === coreForkable.c.FORKABLE_CONTROLLER ){
        controller = new coreController( _config );
        controller.start();

        // startup the message bus broker if not prevented from
        // we are (supposed to be) in a controller process
        //  then fork a new broker process
        if( _config.broker.enabled ){
            controller.registerBroker( coreForkable.fork( coreForkable.c.FORKABLE_BROKER ));
        }

    // we are in a forked process dedicated to the broker, then go
    } else if( process.env[coreForkable.id] === coreForkable.c.FORKABLE_BROKER ){
        broker = new coreBroker( _config );
        broker.start();
    }
}
