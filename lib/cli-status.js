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

    // triggers only 'coreController' valid json runfiles
    coreRunfile.scanDir(( e, json, path ) => {
        if( e ){
            coreLogger.error( e );
        } else {
            coreForkable.statusOf( json[Iztiar.c.forkable.CONTROLLER].listening, ( e, res ) => {
                if( e ){
                    coreLogger.error( e );
                } else {
                   coreLogger.info( res );
                }
            })
            coreForkable.statusOf( json[Iztiar.c.forkable.BROKER].listening, ( e, res ) => {
                if( e ){
                    coreLogger.error( e );
                } else {
                   coreLogger.info( res );
                }
            })
        }
    });
}
