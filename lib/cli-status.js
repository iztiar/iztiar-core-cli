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

    //console.log( '\n' );
    console.log( 'Requiring services status' );
    console.log( 'Scanning run folder for active services...' );
    let services = [];

    // first push identified services just to be able to display the count
    // triggers only coreController-valid json runfiles
    coreRunfile.scanDir(( e, json, path ) => {
        if( e ){
            coreLogger.error( e );
        } else {
            console.log( ' > found', path );
            services.push({ json:json, path:path });
        }
    });
    console.log( '   ', services.length, 'identified service(s)' );

    // and now request the services
    let _forked = null;
    let _forkable = null;
    let _port = null;
    services.every(( o ) => {
        console.log( ' > examining', o.path );

        _forkable = Iztiar.c.forkable.CONTROLLER;
        _port = o.json[_forkable].listening;
        console.log( '   requesting coreController on port '+_port+'...');
        coreForkable.statusOf( _port, ( e, res ) => {
            if( e ){
                coreLogger.error( e );
            } else {
               coreLogger.info( 'received from coreController', res );
               _forked = Object.keys( res )[0];
               console.log( '   coreController:'+res[_forked].listening+' answers:');
               _forkable = Iztiar.c.forkable.CONTROLLER;
               console.log( '     name          : '+res[_forked].config.controller.name );
               console.log( '     broker enabled: '+res[_forked].config.broker.enabled );
               console.log( '     listening port: '+res[_forked].listening );
               console.log( '     log file      : '+res[_forked].logfile );
               console.log( '     log level     : '+res[_forked].loglevel );
               console.log( '     pid           : '+res[_forked].pid );
               console.log( '     status:       : '+res[_forked].status );
               console.log( '     version       : '+res[_forked].status );
               console.log( '     IZTIAR_DEBUG  : '+res[_forked].environment.IZTIAR_DEBUG );
               console.log( '     IZTIAR_ENV    : '+res[_forked].environment.IZTIAR_ENV );
               console.log( '     NODE_ENV      : '+res[_forked].environment.NODE_ENV );
            }
        });

        _forkable = Iztiar.c.forkable.BROKER;
        if( o.json[_forkable] ){
            _port = o.json[_forkable].listening;
            console.log( '   requesting coreBroker on port '+_port+'...');
            coreForkable.statusOf( _port, ( e, res ) => {
                if( e ){
                    coreLogger.error( e );
                } else {
                   coreLogger.info( 'received from coreBroker', res );
                   _forked = Object.keys( res )[0];
                   console.log( '   coreBroker:'+res[_forked].listening+' answers:');
                   console.log( '     name          : '+res[_forked].config.controller.name );
                   console.log( '     listening port: '+res[_forked].listening );
                   console.log( '     log file      : '+res[_forked].logfile );
                   console.log( '     log level     : '+res[_forked].loglevel );
                   console.log( '     messaging port: '+res[_forked].config.broker.messagingPort );
                   console.log( '     pid           : '+res[_forked].pid );
                   // run: same than coreController by definition
                   console.log( '     status:       : '+res[_forked].status );
                   // storageDir: same than coreController by definition
                   console.log( '     version       : '+res[_forked].status );
                   console.log( '     IZTIAR_DEBUG  : '+res[_forked].environment.IZTIAR_DEBUG );
                   console.log( '     IZTIAR_ENV    : '+res[_forked].environment.IZTIAR_ENV );
                   console.log( '     NODE_ENV      : '+res[_forked].environment.NODE_ENV );
                }
            });
        }
    });
}
