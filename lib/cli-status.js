/*
 * cli-status.js
 *
 * Display a status of running controller(s) and their attached brokers
 * 
 * Scan the runDir directory for pid files which qualify the running controllers
 *  and ask them their status
 */
import fs from 'fs';
import path from 'path';

import { Iztiar, coreConfig, coreLogger, coreForkable, coreController, utils } from './imports.js';

// a callback for check our controller.json run files, will be deleted in not ok
//  returns true|false
function _jsonCheck( fname, json, parms ){
    coreLogger.debug( 'fname', fname, 'json', json );
    return ( json && json[coreForkable.c.FORKABLE_CONTROLLER].listening ) ? true : false;
}

// a callback to be executed for each controller run file found
//  no return  value
//  async
function _jsonStatus( fname, json, parms ){
    coreController.statusOf( json.listening, ( e, res ) => {
        if( e ){
            coreLogger.error( e );
        } else {
            //_results[_json.pid] = res;
            coreLogger.debug( 'cliStatus()._jsonStatus receives ', res );
            if( parms && parms.cb ){
                parms.cb( fname, json, res );
            }
        }
    })
}
function _displayStatus( fname, json, result ){
    coreLogger.info( 'cliStatus()._displayStatus receives ', result );
}

export function cliStatus(){

    const runDir = coreConfig.getPidDir();
    const prefix = coreConfig.getControllerRuntimePrefix();
    const regex = [
        new RegExp( '^'+prefix ),
        new RegExp( '.json$' )
    ];
    const options = {
        cbCheck: _jsonCheck,
        cbExec: _jsonStatus,
        parmExec: {
            cb: _displayStatus
        }
    };
    utils.dirScanSync( runDir, regex, options );
}
