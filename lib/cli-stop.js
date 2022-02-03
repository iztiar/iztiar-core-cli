/*
 * cli-stop.js
 *
 * Stop the named controller and its attached broker/controller(s).
 */
import { Iztiar, coreConfig, coreError, coreForkable, coreLogger, corePromise, coreRunfile } from './imports.js';

export function cliStop( config ){

    const name = config.controller.name;
    console.log( 'Stopping '+name+' service(s)' );
    let msg = null;
    
    const fname = coreRunfile.runFname( name );
    const controller = coreRunfile.getTopController( fname );
    coreLogger.debug( 'found controller', controller );
    const port = controller.listening || 0;
   
    if( port ){
        console.log( ' > examining', fname );
        console.log( '   requesting coreController on port '+port+'...');
        coreForkable.requestAnswer( port, 'iz.stop', ( e, res ) => {
            console.log( res );
        });
    } else {
        console.log( ' ! No service running.' );
    }

    /*
    if( controller.pid ){
        msg = 'terminating the \''+name+'\' controller (pid='+controller.pid+')';
        coreLogger.info( msg );
        console.log( ' > asking for '+msg+'...' );
        process.kill( controller.pid, 'SIGTERM' );
    }
    */
}
