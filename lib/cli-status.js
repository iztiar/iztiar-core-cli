/*
 * cli-status.js
 *
 * Display the status of running controller(s) and their attached brokers
 * 
 * Scan the runDir directory for pid files which qualify the running controllers
 *  and ask them their status
 */
import { Iztiar, coreForkable, coreLogger, coreRunfile } from './imports.js';

export function cliStatus(){

    process.on( 'SIGTERM', () => {
        console.log( 'terminating' );
    });

    console.log( 'Requiring services status' );
    console.log( 'Scanning run folder for active services...' );
    let services = [];

    // first push identified services just to be able to display the count
    // triggers only coreController-valid json runfiles
    coreRunfile.scanDir(( e, name, json, path ) => {
        if( e ){
            coreLogger.error( e.name, e.message );
        } else {
            console.log( ' > found', name );
            services.push({ name:name, json:json, path:path });
        }
    });
    console.log( '   ', services.length, 'identified service(s)' );

    // and now request the services
    let _forkable = null;
    let _port = null;
    let _forked = null;
    let _listening = null;
    services.every(( o ) => {
        console.log( ' > examining', o.name, 'service' );

        _forkable = Iztiar.c.forkable.CONTROLLER;
        _port = o.json[_forkable].listening;
        console.log( '   requesting coreController on port '+_port+'...');
        coreForkable.statusOf( _port, ( e, res ) => {
            if( e ){
                console.log( '   coreController doesn\'t answer!' );
            } else {
               coreLogger.info( 'received from coreController', res );
               _forked = Object.keys( res )[0];
               _listening = res[_forked].listening;
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
        if( o.json[_forkable] ){
            _port = o.json[_forkable].listening;
            console.log( '   requesting coreBroker on port '+_port+'...');
            coreForkable.statusOf( _port, ( e, res ) => {
                //coreLogger.debug( 'coreBroker e', e );
                //coreLogger.debug( 'coreBroker res', res );
                if( e ){
                    console.log( '   coreBroker doesn\'t answer!' );
                } else {
                    coreLogger.info( 'received from coreBroker', res );
                   _forked = Object.keys( res )[0];
                   _listening = res[_forked].listening;
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
    });
}
