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
 *          "name":                 mandatory and checked
 *          "pid":                  mandatory and checked
 *          "port":                 mandatory and checked
 *      },
 *      "coreBroker": {         always while a coreBroker is running, removed when the coreBroker is stopping
 *                              may be absent if no coreBroker is attached to this coreController
 *          "name":                 mandatory and checked
 *          "pid":                  mandatory and checked
 *          "port":                 mandatory and checked
 *          "manager":              not checked
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
import fs from 'fs';
import path from 'path';

import { Iztiar, coreConfig, coreError, msg, utils } from './imports.js';

export class coreRunfile {

    /**
     * @param {string} name the name of the controller service
     * @returns {JSON|null} the coreBroker part of the JSON runfile
     */
    static getBroker( name ){
        const _json = coreRunfile.jsonByName( name ) || {};
        return Object.keys( _json ).includes( Iztiar.c.forkable.BROKER ) ? _json[Iztiar.c.forkable.BROKER] : null;
    }

    /**
     * @param {string} name the name of the controller service
     * @returns {JSON} the coreController part of the JSON runfile
     */
    static getController( name ){
        const _json = coreRunfile.jsonByName( name );
        return Object.keys( _json ).includes( Iztiar.c.forkable.CONTROLLER ) ? _json[Iztiar.c.forkable.CONTROLLER] : null;
    }

    /**
     * @param {string} name the name of the controller
     * @returns {JSON} the content of the run file, or null
     */
     static jsonByName( name ){
        return utils.jsonReadFileSync( coreRunfile.runFile( name ));
    }

    /**
     * @param {string} fname the full pathname of the runfile
     * @returns {string} the name of the controller service
     * @throws {coreError}
     */
    static nameFromPath( fname ){
        if( !fname || typeof fname !== 'string' || !fname.length ){
            throw new coreError( coreError.e.RUNFILE_PATHUNSET );
        }
        let _name = path.basename( fname );
        _name = _name.replace( coreConfig.getControllerFilePrefix(), '' );
        _name = _name.replace( '.json', '' );
        return _name;
    }

    /**
     * @param {string} name the name of the controller service
     * @returns {Object} an object of expected running services (those who have a runfile)
     *  where each service is provided as forkable: { pid, port }
     */
    static processes( name ){
        const _json = coreRunfile.jsonByName( name ) || {};
        return coreRunfile.processesFromJson( _json );
    }

    /**
     * @param {JSON} json the content of the runfile
     * @returns {Object} an object of found services as { forkable: { name, pid, port }, ... }
     *  plus a 'errs' key which is an array of error messages (maybe empty, but always here)
     */
    static processesFromJson( json ){
        let _result = {};
        _result.errs = [];
        _result.procs = {};
        let _countController = 0;
        let _countBroker = 0;
        let _countOther = 0;
        for( const _forkable in json ){
            //console.log( 'forkable', _forkable );
            if( !json[_forkable] ){
                _result.errs.push( coreError.e.RUNFILE_EMPTYFORKABLE );
            }
            if( !json[_forkable].name ){
                _result.errs.push( coreError.e.RUNFILE_NAMEUNSET );
            }
            if( !json[_forkable].pid ){
                _result.errs.push( coreError.e.RUNFILE_PIDUNSET );
            }
            if( !json[_forkable].port ){
                _result.errs.push( coreError.e.RUNFILE_PORTUNSET );
            }
            if( _forkable === Iztiar.c.forkable.CONTROLLER ){
                _countController += 1;
            } else if( _forkable === Iztiar.c.forkable.BROKER ){
                _countBroker += 1;
            } else {
                _countOther += 1;
            }
            _result.procs[_forkable] = {
                name: json[_forkable].name,
                pid: json[_forkable].pid,
                port: json[_forkable].port
            };
        }
        if( _countController === 0 ){
            _result.errs.push( coreError.e.RUNFILE_NOCONTROLLER );
        } else if( _countController > 1 ){
            _result.errs.push( coreError.e.RUNFILE_TOOMANYCONTROLLERS );
        }
        if( _countBroker > 1 ){
            _result.errs.push( coreError.e.RUNFILE_TOOMANYBROKERS );
        }
        if( _countOther > 0 ){
            _result.errs.push( coreError.e.RUNFILE_UNKNOWNFORKABLE );
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
        msg.debug( 'coreRunfile.remove()', 'name='+name, 'forkable='+forkable );
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
     * Scans the run directory for controller 'saying-they-are-running' runfiles.
     * @returns {Array} an array of objects { name, json }
     */
    static scanDir(){
        const runDir = coreConfig.getPidDir();
        msg.debug( 'coreRunfile.scanDir()', 'runDir='+runDir );
        const prefix = coreConfig.getControllerFilePrefix();
        const regex = [
            new RegExp( '^'+prefix ),
            new RegExp( '\.json$' )
        ];
        let _result = [];
        try {
            utils.dirScanSync( runDir, regex ).every(( o ) => {         // o is { json, path }
                _result.push({ name:coreRunfile.nameFromPath( o.path ), json:o.json });
                return true;
            });
        } catch( e ){
            msg.error( 'utils.scanDir()', e.name, e.message );
            _result = [];
        }
        return _result;
    }

    /**
     * Set the content of a forkable in the JSON runfile
     * @param {string} name the name of the coreController service
     * @param {string} forkable the type of the service to be removed
     * @param {*} content a JSON Object, usually the full Status() of the server
     * @returns {JSON} the updated JSON content
     * @throws coreError (but not ENOENT, this being already handled)
     */
    static set( name, forkable, content ){
        msg.debug( 'coreRunfile.set()', 'name='+name, 'forkable='+forkable, 'content='+content );
        let _written = null;
        let _fname = coreRunfile.runFile( name );
        let _orig = utils.jsonReadFileSync( _fname );
        let _work = { ..._orig };
        delete _work[forkable];
        _work[forkable] = {
            name: name,
            pid: content.pid,
            port: content.port,
            manager: content.manager || '',
            status: content.status,
            helloMessage: content.helloMessage
        };
        _written = utils.jsonWriteFileSync( _fname, _work, _orig );
        return _written;
    }

    /**
     * Inconditionnaly remove a runfile
     * @param {string} name the name of the coreController service
     */
    static unlink( name ){
        msg.debug( 'coreRunfile.unlink()', 'name='+name );
        utils.unlink( coreRunfile.runFile( name ));
    }
}
