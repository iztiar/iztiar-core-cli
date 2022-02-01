/*
 * cli-stop.js
 *
 * Stop the named controller and its attached broker.
 */
import { Iztiar, coreConfig, coreLogger, coreController, utils } from './imports.js';

export function cliStop( name ){

    const fname = coreController.getJsonPath( coreConfig.getControllerRuntimeConfig( name ).controller.name );
    coreLogger.debug( 'cliStop() fname='+fname );

    let json = utils.jsonReadFileSync( fname ) || {};
    if( json && json[Iztiar.c.forkable.CONTROLLER] ){
        const controller = json[Iztiar.c.forkable.CONTROLLER];

        if( controller.pid ){
            coreLogger.info( 'terminating the \''+name+'\' controller (pid='+controller.pid+')...' );
            process.kill( controller.pid, 'SIGTERM' );
        }
    }
}
