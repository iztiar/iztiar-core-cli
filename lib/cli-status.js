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

import { Iztiar, coreForkable, msg } from './imports.js';

import { cliListRunnings } from './cli-list-runnings.js';

export function cliStatus( serviceName ){

    msg.out( 'Requiring services status' );

    // coreForkable.checkServiceWithJson() promise resolves as { errs, status, startable, pids }
    const _serviceStatusPromise = function( result, name ){
        //console.log( 'name', name, 'result', result );
        if( result.reasons.length  ){
            msg.warn( '\''+name+'\' service exhibits', result.reasons.length, 'error message(s)' );
            msg.warn( ' You may want use --force-stop option to remove the falsy \''+name+'\' from your run directory' );
            Iztiar.exitCode( 1+Iztiar.exitCode());
        } else {
            msg.out( chalk.green( 'Service \''+name+'\' is confirmed up and running' ));
        }
        return Promise.resolve( true );
    }

    let _promise = new Promise(( resolve, reject ) => {
        cliListRunnings({ title:false })
            .then(( services ) => {
                let _p = Promise.resolve( true );
                services.every(( o ) => {
                    //console.log( o.name, o.json );
                    _p = _p
                        .then(() => { return coreForkable.checkServiceWithJson( o.name, o.json, true )})
                        .then(( res ) => { return _serviceStatusPromise( res, o.name )});
                    return true;
                });
                _p.then(() => { resolve( true )});
            });
    });


        /*
        _forkable = Iztiar.c.forkable.CONTROLLER;
        _port = o.processes[_forkable].port;
        console.log( '   requesting coreController on port '+_port+'...');
        coreForkable.statusOf( _port, ( e, res ) => {
            if( e ){
                console.log( '   coreController doesn\'t answer!' );
            } else {
               msg.info( 'received from coreController', res );
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
                //msg.debug( 'coreBroker e', e );
                //msg.debug( 'coreBroker res', res );
                if( e ){
                    console.log( '   coreBroker doesn\'t answer!' );
                } else {
                    msg.info( 'received from coreBroker', res );
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
