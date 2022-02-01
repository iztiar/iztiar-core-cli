/*
 * cli-start.js

 * Starts a controller
 * If not prevented against, the controller will then startup its message bus broker.
 * 
 * See also cmdline.js for a more detailed rationale.
 */
import { Iztiar, coreLogger, coreConfig, coreForkable, coreBroker, coreController } from './imports.js';

export function cliStart( name, cbExit ){

    // get the applicable configuration
    let _config = coreConfig.getControllerRuntimeConfig( name );
    let _procName = Iztiar.getProcName();
    coreLogger.debug( 'coreStart() config %o', _config, 'procName='+_procName );
    //coreLogger.debug( 'coreStart() isTTY=', process.stdout.isTTY );  // always TRUE
    let controller = null;
    let broker = null;
    let forker = null;

    // startup the controller
    // if we are in the main CLI process, then ask to fork the coreController
    if( !_procName ){
        forker = coreController.getForkOptions();
        forker.cbExit = cbExit;
        coreForkable.fork( forker );

    // if we are in a forked process dedicated to this task, then go
    } else if( _procName === Iztiar.c.forkable.CONTROLLER ){
        controller = new coreController( _config );
        controller.start();

        // startup the message bus broker if not prevented from
        // we are (supposed to be) in a controller process
        //  then fork a new broker process
        if( _config.broker.enabled ){
            forker = coreBroker.getForkOptions();
            forker.parent = controller;
            const child = coreForkable.fork( forker );
            controller.registerBroker( child );
        }

    // we are in a forked process dedicated to the broker, then go
    } else if( _procName === Iztiar.c.forkable.BROKER ){
        broker = new coreBroker( _config );
        broker.start();
    }

    return forker;
}
