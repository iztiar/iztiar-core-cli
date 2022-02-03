/*
 * cli-start.js

 * Starts a controller
 * If not prevented against, the controller will then startup its message bus broker.
 * 
 * See also cmdline.js for a more detailed rationale.
 */
import { Iztiar, coreLogger, coreConfig, coreForker, coreForkable, coreBroker, coreController } from './imports.js';

export function cliStart( name, cbExit ){

    if( !Iztiar.envForked()){
        console.log( 'Starting services' );
    }

    // get the applicable configuration
    let _config = coreConfig.getControllerRuntimeConfig( name );
    let _procName = Iztiar.envForked();
    coreLogger.debug( 'coreStart() procName='+_procName, 'config=', _config );
    //coreLogger.debug( 'coreStart() isTTY=', process.stdout.isTTY );  // always TRUE
    let controller = null;
    let broker = null;
    let forker = null;

    const onStartup = function( child, messageData, parms ){
        const _messageKeys = Object.keys( messageData );
        const _forkable = _messageKeys[0];
        let _msg = null;
        if( _forkable === Iztiar.c.forkable.CONTROLLER ){
            _msg = 'coreController ' + messageData[_forkable].config.controller.name;
            _msg += ' successfully startup, listening on port ' + messageData[_forkable].listening;
        } else {
            _msg = 'coreBroker successfully startup, managed by '+messageData[_forkable].config.controller.name+' coreController';
            _msg += ', listening on port ' + messageData[_forkable].listening;
            _msg += ' (message bus on port ' + messageData[_forkable].config.broker.messagingPort + ')';
        }
        console.log( ' + '+_msg );
    }

    // startup the controller
    // if we are in the main CLI process, then ask to fork the coreController
    if( !_procName ){
        forker = coreController.getForker( _config );
        forker.registerHandler( 'startup', onStartup );
        forker.registerHandler( 'ALL', cbExit );
        console.log( ' - requesting for coreController to start...' );
        coreForkable.fork( forker );

    // if we are in a forked process dedicated to this task, then go
    } else if( _procName === Iztiar.c.forkable.CONTROLLER ){
        controller = new coreController( _config );
        controller.start();

        // startup the message bus broker if not prevented from
        // we are (supposed to be) in a controller process
        //  then fork a new broker process
        if( _config.broker.enabled ){
            forker = coreBroker.getForker( _config );
            forker.registerHandler( 'startup', coreController.onBrokerStartup );
            forker.registerHandler( 'startup', onStartup );
            console.log( ' - requesting for coreBroker to start...' );
            coreForkable.fork( forker );
        }

    // we are in a forked process dedicated to the broker, then go
    } else if( _procName === Iztiar.c.forkable.BROKER ){
        broker = new coreBroker( _config );
        broker.start();
    }

    return forker;
}
