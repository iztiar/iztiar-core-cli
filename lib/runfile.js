/**
 * runfile.js
 *  Manages the JSON run file living on disk while the controller is running.
 * 
 * As a reminder of the dynamic of the servers:
 * 
 *  - 'start':
 *      1. forks a *named* controller process
 *      2. this (forked from main CLI process) controller process starts and runs the controller server
 *              > the main characteristics of this process are written in this runfile
 *      3. this (forked from main CLI process) controller process forks a broker process if not prevented from (command-line option --message-bus)
 *      4. this (forked from controller process) broker process starts and runs
 *          a) a message broker which manages the messages bus
 *          b) a broker server which manages communications with the controller server above
 *              > the main characteristics of this process are written in this runfile
 * 
 *  - 'stop':
 *      1. reads the pid of the controller server to be stopped from the runfile
 *      2. sends a SIGTERM signal to the controller process
 *      3. the controller process handles this SIGTEM signal
 *      4. reads the pid of its attached broker (if any) from the runfile
 *      5. sends a SIGTERM signal to the broker process
 *      6. the broker process handles this SIGTEM signal
 *      7. the broker process terminates its message and communication servers, and exits its process
 *      8. the controller process terminates its communication server, and exits its process
 * 
 * The runfile is a JSON file, named along the service name, which contains:
 *  {
 *      "coreController": {     always while a coreController is running, removed when the coreController is stopping
 *          "pid":
 *          "port":
 *          "logLevel":
 *      },
 *      "coreBroker": {         always while a coreBroker is running, removed when the coreBroker is stopping
 *                              may be absent if no coreBroker is attached to this coreController
 *          "pid":
 *          "controller": {
 *              "port":
 *          },
 *          "messaging": {
 *              "port":
 *          }
 *          "logLevel":
 *      }
 *  }
 * 
 * Note:
 *  Though this may not be obvious above, the runfile is updated by both the coreController and the coreBroker processes.
 *  This class makes its best to prevent race conditions between the two processes.
 * 
 * Note:
 *  In order to provide as most accuracy as possible, disk accesses are synchronous.
 */
import path from 'path';

import { Iztiar, coreConfig, coreError, coreLogger, utils } from './imports.js';

/*
 * Reads from disk the last version of the JSON run file for this named service,
 * or an empty JSON if the file does not exist
 * 
 * @param {string} name the name of the controller service
 * @returns {JSON} the JSON content
 * @throws coreError (but not ENOENT, this being already handled)
 */

function _jsonByPath( fname ){
    return utils.jsonReadFileSync( fname );
}

export class coreRunfile {

    /**
     * @param {string} name the name of the controller
     * @returns {JSON} the content of the run file
     */
    static byName( name ){
        return _jsonByPath( coreRunfile.runFile( name ));
    }
    
    /**
     * @param {JSON} json the full content of the runfile
     * @returns {number[]} the array of the pids of the running processes
     */
    static getPidList( json ){
        let _pids = [];
        Object.keys( json ).every(( k ) => {
            //console.log( k );
            _pids.push( json[k].pid );
            return true;
        });
        return _pids;
    }

    /**
     * @param {JSON} json the full content of the runfile
     * @returns {JSON} the content of the runfile for the main coreController, maybe empty
     */
    static getTopController( json ){
        if( json[Iztiar.c.forkable.CONTROLLER] && json[Iztiar.c.forkable.CONTROLLER].listening&& json[Iztiar.c.forkable.CONTROLLER].pid ){
            return json[Iztiar.c.forkable.CONTROLLER]
        }
        return {}
    }

    /**
     * @param {string} name the name of the controller service
     * @returns {Object} an object of expected running services (those who have a runfile)
     *  where each service is provided as forkable: { pid, port }
     */
    static processes( name ){
        const _json = coreRunfile.byName( name ) || {};
        let _result = {};
        //console.log( Object.keys( Iztiar.c.forkable ));
        for( const k in Iztiar.c.forkable ){
            const _forkable = Iztiar.c.forkable[k];
            //console.log( _forkable );
            if( _json[_forkable] && _json[_forkable].pid && _json[_forkable].port ){
                _result[_forkable] = {
                    pid:_json[_forkable].pid,
                    port:_json[_forkable].port
                };
            }
        }
        return _result;
    }

    /**
     * Remove a forkable and its content from a JSON runfile
     * This mainly occurs when the server is being shutting down
     * @param {string} name the name of the coreController service
     * @param {string} forkable the type of the service to be removed
     * @returns {JSON|null} the new JSON content after this deletion
     * @throws coreError (but not ENOENT, this being already handled)
     */
    static remove( name, forkable ){
        return utils.jsonRemoveKeySync( coreRunfile.runFile( name ), forkable );
    }

    /**
     * Compute the full pathname of the JSON run file for this named controller service.
     * Public as a part of the startup advertising and of the 'iz.status' server answer.
     * 
     * @param {string} name the name of the controller service
     * @returns {string} the full pathname of the JSON run file for this controller service
     * @throws {coreError} if name is empty, null or undefined
     */
    static runFile( name ){
        if( !name || typeof name !== 'string' || !name.length ){
            throw new coreError( coreError.e.RUNFILE_NAMEUNSET );
        }
        return path.join( coreConfig.getPidDir(), coreConfig.getControllerFileName( name )+'.json' )
    }

    /**
     * Scans the run directory for controller runfiles, calling the cb callback for each found,
     * valid regarding coreController, runfile.
     * @param {Callback} cb a callback which will be called for each and every found runfile
     *  the cb must be of the form ( e, name, json, fname ).
     */
    static scanDir( cb ){
        const runDir = coreConfig.getPidDir();
        coreLogger.debug( 'coreRunfile.scanDir()', runDir );
        const prefix = coreConfig.getControllerFilePrefix();
        const regex = [
            new RegExp( '^'+prefix ),
            new RegExp( '\.json$' )
        ];
        try {
            utils.dirScanSync( runDir, regex ).every(( o ) => {
                if( coreRunfile.validateJson( o.json, Iztiar.c.forkable.CONTROLLER )){
                    const name = o.json[Iztiar.c.forkable.CONTROLLER].config.controller.name;
                    cb( null, name, o.json, o.path );
                }
                return true;
            });
        } catch( e ){
            cb( e );
        }
    }

    /**
     * Set the content of a forkable in the JSON runfile
     * @param {string} name the name of the coreController service
     * @param {string} forkable the type of the service to be removed
     * @param {*} content a JSON Object to be written as the content of the forkable
     * @returns {JSON} the updated JSON content
     * @throws coreError (but not ENOENT, this being already handled)
     */
    static set( name, forkable, content ){
        let _written = null;
        let _fname = coreRunfile.runFile( name );
        let _orig = utils.jsonReadFileSync( _fname );
        let _work = { ..._orig };
        delete _work[forkable];
        _work[forkable] = content;
        _written = utils.jsonWriteFileSync( _fname, _work, _orig );
        return _written;
    }

    /**
    * In order to be valid and usable, the JSON runfile must at least contains, for the specified forkable:
    *  - a pid 
    *  - a listening communication port.
    * 
    * If these two values are not both present, then the JSON file is unsuable regarding this forkable.
    * 
    * One can so assume that:
    * - the corresponding service is currently starting, not yet ready
    * - the corresponding service is currently stopping, not yet terminated
    * - the corresponding service doesn't run.
    * 
    * Valid forkables are:
    *  - Iztiar.c.forkable.BROKER
    *  - Iztiar.c.forkable.CONTROLLER
    */
    static validateJson( json, forkable ){
        let _res = false;
        if( !json ){
            coreLogger.debug( 'coreRunfile._isValidKey() json empty, nul or undefined' );
        } else if( !json[forkable] ){
            coreLogger.debug( 'coreRunfile._isValidKey() forkable='+forkable+' not found in JSON' );
        } else if( !json[forkable].pid ){
            coreLogger.debug( 'coreRunfile._isValidKey() forkable='+forkable+' doesn\' have \'pid\' information' );
        } else if( !json[forkable].port ){
            coreLogger.debug( 'coreRunfile._isValidKey() forkable='+forkable+' doesn\' have \'port\' information' );
        } else {
            _res = true;
        }
        if( !_res ){
            coreLogger.error( 'forkable \''+forkable+'\' considered as unusable in JSON runfile', json );
        }
        return _res;
    }
}
