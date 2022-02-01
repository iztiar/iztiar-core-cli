/*
 * cli-status.js
 *
 * Display the status of running controller(s) and their attached brokers
 * 
 * Scan the runDir directory for pid files which qualify the running controllers
 *  and ask them their status
 */
import { Iztiar, coreConfig, coreLogger, coreForkable, coreBroker, coreController, utils } from './imports.js';

// a callback to be executed for each controller run file found
//  here request for controller and broker status 
//  no return  value
//  async
function _jsonStatus( fname, json, parms ){
    coreController.statusOf( json[coreForkable.c.FORKABLE_CONTROLLER].listening, ( e, res ) => {
        if( e ){
            coreLogger.error( e );
        } else {
            //_results[_json.pid] = res;
            //coreLogger.debug( 'cliStatus()._jsonStatus receives ', res );
            if( parms && parms.cb ){
                parms.cb( fname, json, res );
            }
            if( parms && parms.forker ){
                parms.forker.fromController = true;
                parms.forker.ready = ( parms.forker.fromController && parms.forker.fromBroker );
            }
        }
    })
    coreBroker.statusOf( json[coreForkable.c.FORKABLE_BROKER].listening, ( e, res ) => {
        if( e ){
            coreLogger.error( e );
        } else {
            //_results[_json.pid] = res;
            //coreLogger.debug( 'cliStatus()._jsonStatus receives ', res );
            if( parms && parms.cb ){
                parms.cb( fname, json, res );
            }
            if( parms && parms.forker ){
                parms.forker.fromBroker = true;
                parms.forker.ready = ( parms.forker.fromController && parms.forker.fromBroker );
            }
        }
    })
}
function _displayStatus( fname, json, result ){
    coreLogger.info( 'cliStatus()._displayStatus receives ', result );
}

export function cliStatus(){

    let forker = {
        flowEnded: false,
        ready: false,
        fromController: false,
        fromBroker: false
    }

    const runDir = coreConfig.getPidDir();
    const prefix = coreConfig.getControllerRuntimePrefix();
    const regex = [
        new RegExp( '^'+prefix ),
        new RegExp( '\.json$' )
    ];
    const options = {
        cbCheck: coreController.checkJsonRun,
        cbExec: _jsonStatus,
        parmExec: {
            cb: _displayStatus,
            forker: forker
        }
    };
    utils.dirScanSync( runDir, regex, options );

    return forker;
}
