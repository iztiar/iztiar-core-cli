/*
 * cli-restart.js
 *  Restart the 'name' service controller (and its attached broker if any).
 */
import chalk from 'chalk';

import { cliStart } from './cli-start.js';
import { cliStop } from './cli-stop.js';
import { Iztiar, coreLogger } from './imports.js';

export function cliRestart( serviceName, options={} ){

    coreLogger.debug( 'cliRestart()', 'serviceName='+serviceName, 'options', options );

    if( serviceName === 'ALL' ){
        console.log( chalk.red( '\'ALL\' is an invalid service name' ));
        Iztiar.exitCode( 1+Iztiar.exitCode());
        return Promise.resolve( true );
    }

    // run cliStop() with --force-stop option if the first try is not successfull
    const _tryForceStop = function( res, name ){
        if( !res.startable || Iztiar.exitCode()){
            console.log( chalk.yellow( 'Trying to --force-stop the \''+name+'\' service' ));
            return cliStop( name, { forceStop:true });
        } else {
            return Promise.resolve( res );
        }
    }

    let _promise = Promise.resolve( true )
        .then(( res ) => { return cliStop( serviceName )})
        .then(( res ) => { return _tryForceStop( res, serviceName )})
        .then(( res ) => { return cliStart( serviceName )})

    return _promise;
}
