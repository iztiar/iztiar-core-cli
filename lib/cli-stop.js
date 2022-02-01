/*
 * cli-stop.js
 *
 * Stop the named controller and its attached broker.
 */
import { Iztiar, coreConfig, coreLogger, coreForkable, coreController, utils } from './imports.js';

export function cliStop( name ){

    const fname = coreController.getJsonPath( coreConfig.getControllerRuntimeConfig( name ).controller.name );
    coreLogger.debug( 'cliStop() fname='+fname );

    let json = utils.jsonReadFileSync( fname ) || {};
    if( json && json[coreForkable.c.FORKABLE_CONTROLLER] ){
        const controller = json[coreForkable.c.FORKABLE_CONTROLLER];

        if( controller.pid ){
            coreLogger.info( 'terminating the \''+name+'\' controller (pid='+controller.pid+')...' );
            process.kill( controller.pid, 'SIGTERM' );
        }
    }
}
