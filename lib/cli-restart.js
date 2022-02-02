/*
 * cli-restart.js
 *  Restart the 'name' service controller (and its attached broker if any).
 */
import { cliStart } from './cli-start.js';
import { cliStop } from './cli-stop.js';

export function cliRestart( name, cb ){

    coreLogger.debug( 'cliRestart() name='+name );
    cliStop( name );
    let forker = cliStart( name, cb )

    return forker;
}
