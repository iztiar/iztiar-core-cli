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
import path from 'path';
import ps from 'ps';

import { Iztiar, coreConfig, coreError, coreLogger, utils } from './imports.js';

export class coreRunfile {
    
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
     * @param {string} name the name of the controller
     * @returns {JSON} the content of the run file
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
     * Check that the given process is alive, i.e. the PID exists and the servers answers on its port.
     * @param {string} name the name of the service controller
     * @param {string} forkable either coreController or coreBroker
     * @param {Object} json a process as described by coreRunfile.processes { pid, port }
     * @param {boolean} remove whether to remove the described process from the run file if no more alive
     * @param {integer} timeout timeout (ms) when waiting for the server answer
     * @returns {Promise} a promise which eventually resolves with a boolean {true|false}
     */
    static processCheck( name, forkable, json, remove=false, timeout=100 ){
        coreLogger.debug( 'coreRunfile.processCheck()', 'name='+name, 'forkable='+forkable, 'json=', json, 'remove='+remove, 'timeout='+timeout );
        const _checkPid = function( pid ){
            return new Promise(( resolve, reject ) => {
                ps({ pid:pid })
                    .then(( res ) => {
                        resolve( res );
                    }, ( rej ) => {
                        coreLogger.warn( 'coreRunfile.processCheck()', 'pid='+pid, 'reject', rej );
                        resolve( false );
                    })
                    .catch(( e ) => {
                        coreLogger.error( 'coreRunfile.processCheck()', 'pid='+pid, e.name, e.message );
                        resolve( false );
                    });
            });
        }
        const _checkPort = function( port ){
            return new Promise(( resolve, reject ) =>  {
                utils.tcpRequest( port, 'iz.ping' )
                    .then(( res ) => {
                        resolve( res );
                    }, ( rej ) => {
                        coreLogger.warn( 'coreRunfile.processCheck()', 'port='+port, 'reject', rej );
                        resolve( false );
                    })
                    .catch(( e ) => {
                        coreLogger.error( 'coreRunfile.processCheck()', 'port='+port, e.name, e.message );
                        resolve( false );
                    });
            });
        }
        const _checkTimeout = function( timeout ){
            return new Promise(( resolve, reject ) => {
                // not used at the moment - see cliStart() for an example of timeout
            });
        }
        return _checkPid( json.pid )
            .then(( res ) => {
                if( res && res.length ){
                    coreLogger.debug( 'coreRunfile.processCheck()', 'pid='+json.pid, 'resolved with res=', res );
                    return _checkPort( json.port );
                } else {
                    coreLogger.debug( 'coreRunfile.processCheck()', 'pid='+json.pid, 'resolving as falsy' );
                    return Promise.resolve( false );
                }
            })
            .then(( res ) => {
                if( res ){
                    coreLogger.debug( 'coreRunfile.processCheck()', 'port='+json.port, 'resolved with res=', res );
                    return Promise.resolve( true );
                } else {
                    coreLogger.debug( 'coreRunfile.processCheck()', 'port='+json.port, 'resolving as falsy' );
                    return Promise.resolve( false );
                }
            })
            .then(( res ) => {
                coreLogger.debug( 'coreRunfile.processCheck() may remove', 'name='+name, 'forkable='+forkable, 'res='+res );
                if( remove ){
                    coreRunfile.remove( name, forkable );
                }
                return Promise.resolve( res );
            });
    }

    /**
     * @param {string} name the name of the controller service
     * @returns {Object} an object of expected running services (those who have a runfile)
     *  where each service is provided as forkable: { pid, port }
     */
    static processes( name ){
        const _json = coreRunfile.jsonByName( name ) || {};
        let _result = {
            ...coreRunfile.processesFromJson( _json )
        };
        return _result;
    }

    /**
     * @param {JSON} json the content of the runfile
     * @returns {Object} an object of found services as { forkable: { name, pid, port }, ... }
     * @throws {coreError}
     */
    static processesFromJson( json ){
        let _result = {};
        for( const _forkable in json ){
            //console.log( 'forkable', _forkable );
            if( !json[_forkable] ){
                throw new coreError( coreError.e.RUNFILE_EMPTYCONTENT );
            }
            if( !json[_forkable].name ){
                throw new coreError( coreError.e.RUNFILE_NAMEUNSET );
            }
            if( !json[_forkable].pid ){
                throw new coreError( coreError.e.RUNFILE_PIDUNSET );
            }
            if( !json[_forkable].port ){
                throw new coreError( coreError.e.RUNFILE_PORTUNSET );
            }
            _result[_forkable] = {
                name: json[_forkable].name,
                pid: json[_forkable].pid,
                port: json[_forkable].port
            };
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
        coreLogger.debug( 'coreRunfile.remove()', 'name='+name, 'forkable='+forkable );
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
        coreLogger.debug( 'coreRunfile.scanDir()', 'runDir='+runDir );
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
            coreLogger.error( 'utils.scanDir()', e.name, e.message );
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
        coreLogger.debug( 'coreRunfile.set()', 'name='+name, 'forkable='+forkable, 'content='+content );
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
}