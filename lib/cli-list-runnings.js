/*
 * cli-runnings.js
 *
 * Display the list of running services
 * Returns a Promise resolved with the list of controllers name.
 * 
 * Scan the runDir directory for pid files which qualify the running controllers
 *  and ask them their status
 */
import chalk from 'chalk';

import { coreRunfile, msg } from './imports.js';

export function cliListRunnings( options={} ){

    const _origLevel = msg.consoleLevel();
    const _verboseLevel = Object.keys( options ).includes( 'verbose' ) ? options.verbose : _origLevel;
    msg.consoleLevel( _verboseLevel );

    const _displayTitle = Object.keys( options ).includes( 'title' ) ? options.title : true;
    if( _displayTitle ){
        msg.out( 'Listing running services' );
    }

    // first push identified services just to be able to display the count
    //  scanDir() returns array of { name, json }
    msg.info( 'Scanning run folder for active services...' );
    let services = [];
    coreRunfile.scanDir().every(( o ) => {
        msg.out( ' > found \''+o.name+'\'' );
        services.push( o );
        return true;
    });

    if( services.length == 0 ){
        msg.out( chalk.blue( '   no service is running' ));
    } else if( services.length == 1 ){
        msg.out( chalk.blue( '   one service says it is running' ));
    } else {
        msg.out( chalk.blue( '  ', services.length, 'services say they are running' ));
    }

    msg.consoleLevel( _origLevel );

    return Promise.resolve( services );
}
