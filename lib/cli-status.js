/*
 * cli-status.js
 *
 * Display the status of running controller(s) and their attached brokers
 * 
 * Scan the runDir directory for pid files which qualify the running controllers
 *  and ask them their status
 * 
 * Note:
 *  We do want a sequential display on the console!
 *  But some of our checks our asynchonous, and resolve as Promises.
 *  In order to be sure that a title will be displayed just before the result of the corresponding checks,
 *  but after the previous checks, we have to use only Promises, maybe automatically resolved, but at
 *  least .then() chained.
 */
import chalk from 'chalk';
import { coreForkable } from './forkable.js';

import { Iztiar, coreError, coreLogger, coreRunfile, utils } from './imports.js';

export function cliStatus( serviceName ){

    console.log( 'Requiring services status' );

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
        console.log( chalk.blue( '   ', services.length, 'services say they are running' ));
    }

    const _serviceStatusPromise = function( name, result ){
        //console.log( name, result );
        if( typeof result === 'number' ){
            console.log( chalk.yellow( '   \''+name+'\' service exhibits', result, 'error(s)' ));
            console.log( chalk.yellow( '   You may want use --clean option to remove the falsy \''+name+'\' from your run directory' ));
            Iztiar.exitCode( 1+Iztiar.exitCode());
        } else {
            console.log( chalk.green( '   Service \''+name+'\' is confirmed up and running' ));
        }
        return Promise.resolve( true );
    }

    let _promise = Promise.resolve( true );
    services.every(( o ) => {
        _promise = _promise.then(( res ) => { return coreForkable.checkServiceWithJson( o.name, o.json, true )});
        _promise = _promise.then(( res ) => { return _serviceStatusPromise( o.name, res )});
        return true;
    });

        /*
        _forkable = Iztiar.c.forkable.CONTROLLER;
        _port = o.processes[_forkable].port;
        console.log( '   requesting coreController on port '+_port+'...');
        coreForkable.statusOf( _port, ( e, res ) => {
            if( e ){
                console.log( '   coreController doesn\'t answer!' );
            } else {
               coreLogger.info( 'received from coreController', res );
               _forked = Object.keys( res )[0];
               _listening = res[_forked].port;
               //console.log( 'res', res );
               //console.log( '_forked', _forked );
               console.log( ' + coreController:'+_listening+' answers:');
               console.log( '      myself as coreController' );
               console.log( '         name          : '+res[_forked].config.controller.name );
               console.log( '         listening port: '+_listening );
               console.log( '         status:       : '+res[_forked].status );
               console.log( '         broker enabled: '+res[_forked].config.broker.enabled );
               console.log( '         run           : '+res[_forked].run );
               console.log( '         storageDir    : '+res[_forked].storageDir );
               console.log( '         version       : '+res[_forked].version );
               console.log( '      log' );
               console.log( '         file          : '+res[_forked].logfile );
               console.log( '         level         : '+res[_forked].config.logLevel.toLowerCase());
               console.log( '      process' );
               console.log( '         pid           : '+res[_forked].pid );
               console.log( '         cpu           : '+res[_forked].pidUsage.cpu );
               console.log( '         memory        : '+res[_forked].pidUsage.memory );
               console.log( '         ctime         : '+res[_forked].pidUsage.ctime );
               console.log( '         elapsed       : '+res[_forked].pidUsage.elapsed );
               console.log( '      environment' );
               console.log( '         IZTIAR_DEBUG  : '+res[_forked].environment.IZTIAR_DEBUG );
               console.log( '         IZTIAR_ENV    : '+res[_forked].environment.IZTIAR_ENV );
               console.log( '         NODE_ENV      : '+res[_forked].environment.NODE_ENV );
            }
        });

        _forkable = Iztiar.c.forkable.BROKER;
        if( o[_forkable] ){
            _port = o.processes[_forkable].port;
            console.log( '   requesting coreBroker on port '+_port+'...');
            coreForkable.statusOf( _port, ( e, res ) => {
                //coreLogger.debug( 'coreBroker e', e );
                //coreLogger.debug( 'coreBroker res', res );
                if( e ){
                    console.log( '   coreBroker doesn\'t answer!' );
                } else {
                    coreLogger.info( 'received from coreBroker', res );
                   _forked = Object.keys( res )[0];
                   _listening = res[_forked].port;
                   //console.log( '_forked', _forked );
                   console.log( ' + coreBroker:'+_listening+' answers:');
                   console.log( '      myself as coreBroker' );
                   console.log( '         listening port: '+_listening );
                   console.log( '         messaging port: '+res[_forked].config.broker.messagingPort );
                   console.log( '      the coreController I am attached to' );
                   console.log( '         name          : '+res[_forked].config.controller.name );
                   console.log( '      log' );
                   console.log( '         file          : '+res[_forked].logfile );
                   console.log( '         level         : '+res[_forked].config.logLevel.toLowerCase());
                   console.log( '      process' );
                   console.log( '         pid           : '+res[_forked].pid );
                   console.log( '         cpu           : '+res[_forked].pidUsage.cpu );
                   console.log( '         memory        : '+res[_forked].pidUsage.memory );
                   console.log( '         ctime         : '+res[_forked].pidUsage.ctime );
                   console.log( '         elapsed       : '+res[_forked].pidUsage.elapsed );
                   console.log( '      environment' );
                   console.log( '         IZTIAR_DEBUG  : '+res[_forked].environment.IZTIAR_DEBUG );
                   console.log( '         IZTIAR_ENV    : '+res[_forked].environment.IZTIAR_ENV );
                   console.log( '         NODE_ENV      : '+res[_forked].environment.NODE_ENV );
                }
            });
        }
        */

    //console.log( _promise );
    return _promise;
}
