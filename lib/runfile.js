/**
 * runfile.js
 *  Manages the JSON run file living on disk while the controller/broker are running.
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
 *          "listening":
 *          "config": { ... }
 *      },
 *      "coreBroker": {         always while a coreBroker is running, removed when the coreBroker is stopping
 *                              may be absent if no coreBroker is attached to this coreController
 *          "pid":
 *          "listening":
 *          "config": { ... }
 *      }
 *  }
 * 
 * Note:
 *  Though this may not be obvious above, the runfile is updated by both the coreController and the coreBroker processes.
 *  This class makes its better to prevent race conditions between the two processes.
 * 
 * Note:
 *  In order to provide as most accuracy as possible, disk accesses are synchronous.
 */
import path from 'path';

import { Iztiar, coreConfig, coreLogger, coreResult, utils } from './imports.js';

/*
 * Reads from disk the last version of the JSON run file for this named service,
 * or an empty JSON if the file does not exist
 * 
 * @param {string} name the name of the controller service
 * @returns {JSON} the JSON content
 * @throws coreResult (but not ENOENT, this being already handled)
 */
function _getJson( name ){
    return utils.jsonReadFileSync( coreRunfile.runFname( name ));
}

export class coreRunfile {

    /**
     * Compute the full pathname of the JSON run file for this named controller service.
     * Public as a part of the startup advertising and of the 'iz.status' server answer.
     * 
     * @param {string} name the name of the controller service
     * @returns {string} the full pathname of the JSON run file for this controller service
     * @throws {coreResult} if name is empty, null or undefined
     */
    static runFname( name ){
        if( !name || typeof name !== 'string' || !name.length ){
            throw new coreResult( coreResult.e.NAME_UNSET );
        }
        return path.join( coreConfig.getPidDir(), coreConfig.getControllerRuntimeName( name )+'.json' )
    }

    /**
     * Scans the run directory for controller runfiles, calling the cb callback for each found,
     * valid regarding coreController, runfile.
     * @param {Callback} cb a callback which will be called for each and every found runfile
     *  the cb must be of the form ( e, json, fname ).
     */
    static scanDir( cb ){
        const runDir = coreConfig.getPidDir();
        coreLogger.debug( 'coreRunfile.scanDir()', runDir );
        const prefix = coreConfig.getControllerRuntimePrefix();
        const regex = [
            new RegExp( '^'+prefix ),
            new RegExp( '\.json$' )
        ];
        try {
            utils.dirScanSync( runDir, regex ).every(( o ) => {
                if( coreRunfile.validateJson( o.json, Iztiar.c.forkable.CONTROLLER )){
                    cb( null, o.json, o.path );
                }
                return true;
            });
        } catch( e ){
            cb( e );
        }
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
        } else if( !json[forkable].listening ){
            coreLogger.debug( 'coreRunfile._isValidKey() forkable='+forkable+' doesn\' have \'listening\' information' );
        } else if( !json[forkable].pid ){
            coreLogger.debug( 'coreRunfile._isValidKey() forkable='+forkable+' doesn\' have \'pid\' information' );
        } else {
            _res = true;
        }
        if( !_res ){
            coreLogger.error( 'forkable \''+forkable+'\' considered as unusable in JSON runfile', json );
        }
        return _res;
    }

    // the controller service name
    _name = null;

    // the forkable service type
    _forkable = null;

    // the full pathname of the JSON runfile
    _runfname = null;

    /**
     * @constructor	
     * @param {string} name the name of the controller service
     * @param {string} forkable the identifier of the coreForkable class, valid values being:
     *  - Iztiar.c.forkable.BROKER
     *  - Iztiar.c.forkable.CONTROLLER
     * 
     * This object is to be instanciated both by coreController and coreBroker in order to manage their (common) JSON runfile.
     */
    constructor( name, forkable ){
        coreLogger.debug( 'instanciating new coreRunfile() for '+name+' '+forkable );
        this._name = name;
        this._forkable = forkable;
        this._runfname = coreRunfile.runFname( name );
        return this;
    }

    /**
     * Get the value of a key in a JSON runfile
     * @param {string} key the identifier
     * @returns {*|null} the value of the key for the forkable in our JSON runfile
     * @throws coreResult (but not ENOENT, this being already handled)
     * 
     * As a reminder, coreController and coreBroker use the same JSON runfile.
     */
    get( key ){
        let _json = utils.jsonReadFileSync( this._runfname );
        let _value = null;
        if( _json && _json[this._forkable] && _json[this._forkable].key ){
            _value = _json[this._forkable].key;
        }
        return _value;
    }

    /**
     * Get the value of a key in a JSON runfile for another coreForkable than ours
     * @param {string} forkable the forkable identifier
     * @param {string} key the identifier
     * @returns {*|null} the value of the key for the forkable in our JSON runfile
     * @throws coreResult (but not ENOENT, this being already handled)
     * 
     * As a reminder, coreController and coreBroker use the same JSON runfile.
     */
    getFor( forkable, key ){
        let _json = utils.jsonReadFileSync( this._runfname );
        let _value = null;
        if( _json && _json[forkable] && _json[forkable].key ){
            _value = _json[_forkable].key;
        }
        return _value;
    }

    /**
     * Remove a forkable and its content from a JSON runfile
     * This mainly occurs when the server is being shutting down
     * @returns {JSON|null} the new JSON content after this deletion
     * @throws coreResult (but not ENOENT, this being already handled)
     */
    remove(){
        return utils.jsonRemoveKeySync( this._runfname, this._forkable );
    }

    /**
     * Set the content of a forkable in the JSON runfile
     * @param {*} content a JSON Object to be written as the content of the forkable
     * @returns {JSON} the updated JSON content
     * @throws coreResult (but not ENOENT, this being already handled)
     */
    set( content ){
        let _written = null;
        let _orig = utils.jsonReadFileSync( this._runfname );
        let _work = { ..._orig };
        delete _work[this._forkable];
        _work[this._forkable] = content;
        _written = utils.jsonWriteFileSync( this._runfname, _work, _orig );
        return _written;
    }

    /**
     * @returns the full pathname of this JSON runfile
     */
    fname(){
        return this._runfname;
    }
}
