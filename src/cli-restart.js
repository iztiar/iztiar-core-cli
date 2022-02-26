/*
 * cli-restart.js
 *  Restart the 'name' service controller (and its attached broker if any).
 */
import { Iztiar, coreError, msg } from './imports.js';

import { cliStart } from './cli-start.js';
import { cliStop } from './cli-stop.js';

export function cliRestart( serviceName, options={} ){

    msg.debug( 'cliRestart()', 'serviceName='+serviceName, 'options', options );

    if( serviceName === 'ALL' ){
        msg.error( coreError.e.NAME_ALL_INVALID );
        process.exitCode += 1;
        return Promise.resolve( false );
    }

    // run cliStop() with --force-stop option if the first try is not successfull
    const _tryForceStop = function( res, name ){
        msg.debug( 'cliStop().tryForceStop()', 'res.startable='+res.startable, 'exitCode='+process.exitCode );
        if( !res.startable || process.exitCode ){
            msg.warn( 'Trying to --force-stop the \''+name+'\' service' );
            return Promise.resolve( cliStop( name, { forceStop:true }));
        } else {
            return Promise.resolve( res );
        }
    }

    // cliStart() will fork itself to start the coreController
    //  but here 'itself' means the restart action - which lead to re-run cliStop() and so on :(
    //  so have to prepare a customized version of process.argv
    let _args = process.argv;
    const _setupArgs = function( res ){
        for( let i=0 ; i<_args.length ; ++i ){
            if( _args[i] === 'restart' ){
                _args[i] = 'start';
            }
        }
        return Promise.resolve( res );
    }

    let _promise = Promise.resolve( true )
        .then(( res ) => { return  cliStop( serviceName )})
        .then(( res ) => { return _tryForceStop( res, serviceName )})
        .then(( res ) => { return _setupArgs( res )})
        .then(( res ) => { return  cliStart( serviceName, { args:_args })})

    return _promise;
}
