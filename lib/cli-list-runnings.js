/*
 * cli-runnings.js
 *
 * Display the List of running services
 * Returns a Promise resolved with the list of controllers name.
 * 
 * Scan the runDir directory for pid files which qualify the running controllers
 *  and ask them their status
 */
import chalk from 'chalk';

import { coreRunfile } from './imports.js';

export function cliListRunnings( options={} ){

    const _displayTitle = Object.keys( options ).includes( 'title' ) ? options.title : true;
    if( _displayTitle ){
        console.log( 'Listing running services' );
    }

    // first push identified services just to be able to display the count
    //  scanDir() returns array of { name, json }
    console.log( 'Scanning run folder for active services...' );
    let services = [];
    coreRunfile.scanDir().every(( o ) => {
        console.log( ' > found \''+o.name+'\'' );
        services.push( o );
        return true;
    });

    if( services.length == 0 ){
        console.log( chalk.blue( '   no service is running' ));
    } else if( services.length == 1 ){
        console.log( chalk.blue( '   one service says it is running' ));
    } else {
        console.log( chalk.blue( '  ', services.length, 'services say they are running' ));
    }

    return Promise.resolve( services );
}
