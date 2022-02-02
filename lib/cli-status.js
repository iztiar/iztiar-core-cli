/*
 * cli-status.js
 *
 * Display the status of running controller(s) and their attached brokers
 * 
 * Scan the runDir directory for pid files which qualify the running controllers
 *  and ask them their status
 */
import { Iztiar, coreBroker, coreController, coreLogger, coreRunfile } from './imports.js';

// a callback to be executed for each controller run file found
//  here request for controller and broker status 
//  no return  value
//  async
function _jsonStatus( fname, json, parms ){
}
function _displayStatus( fname, json, result ){
    coreLogger.info( 'cliStatus()._displayStatus receives ', result );
}

export function cliStatus(){

    // triggers only 'coreController' valid json runfiles
    coreRunfile.scanDir(( e, json, path ) => {
        if( e ){
            coreLogger.error( e );
        } else {
            coreController.statusOf( json[Iztiar.c.forkable.CONTROLLER].listening, ( e, res ) => {
                if( e ){
                    coreLogger.error( e );
                } else {
                    /*
                    //_results[_json.pid] = res;
                    //coreLogger.debug( 'cliStatus()._jsonStatus receives ', res );
                    if( parms && parms.cb ){
                        parms.cb( fname, json, res );
                    }
                    if( parms && parms.forker ){
                        parms.forker.fromController = true;
                        parms.forker.ready = ( parms.forker.fromController && parms.forker.fromBroker );
                    }
                    */
                   coreLogger.info( res );
                }
            })
            coreBroker.statusOf( json[Iztiar.c.forkable.BROKER].listening, ( e, res ) => {
                if( e ){
                    coreLogger.error( e );
                } else {
                    /*
                    //_results[_json.pid] = res;
                    //coreLogger.debug( 'cliStatus()._jsonStatus receives ', res );
                    if( parms && parms.cb ){
                        parms.cb( fname, json, res );
                    }
                    if( parms && parms.forker ){
                        parms.forker.fromBroker = true;
                        parms.forker.ready = ( parms.forker.fromController && parms.forker.fromBroker );
                    }
                    */
                   coreLogger.info( res );
                }
            })
        }
    });
}
