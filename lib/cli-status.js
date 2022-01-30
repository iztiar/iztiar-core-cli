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

import { coreController } from './controller.js';
import { coreLogger } from './logger.js';
import { Iztiar } from './global.js';

export function cliStatus( name, cb ){

    const _pidDir = Iztiar.rt.config.getPidDir();
    let _pidFiles = [];
    const _prefix = Iztiar.rt.config.getControllerRuntimePrefix();
    const _sufix = '.json';
    let _results = {};

    fs.readdir( _pidDir, ( e, files ) => {
        if( e ){
            coreLogger.error( e );
        } else {
            files.every(( f ) => {
                if( f.startsWith( _prefix ) && f.endsWith( _sufix )){
                    _pidFiles.push( path.join( _pidDir, f ));
                }
                return true;
            });
            //console.log( 'found ', _pidFiles );
            _pidFiles.every(( f ) => {
                const _json = JSON.parse( fs.readFileSync( f, { encoding: 'utf8' }));
                if( _json && _json.listening ){
                    coreController.StatusOf( _json.listening, ( e, res ) => {
                        if( e ){
                            coreLogger.error( e );
                        } else {
                            _results[_json.pid] = res;
                            console.log( res );
                        }
                    })
                } else {
                    fs.rm( f, ( e ) => {
                        if( e ){
                            coreLogger.error( e );
                        }
                    });
                }
                return true;
            });
        }
    });
}
