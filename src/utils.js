/*
 * utils.js
 */
import chalk from 'chalk';
import deepEqual from 'deepequal';
import fs, { read } from 'fs';
import net from 'net';
import path from 'path';
import ps from 'ps';

import { coreError, coreLogger, msg } from './imports.js';

export const utils = {

    /**
     * Display an error message to the console.
     * @returns {Promise} a true-resolved Promise
     */
    consoleErrorPromise: function(){
        return new Promise(( resolve, reject ) => {
            console.error( chalk.red( ...arguments ));
            resolve( true );
        });
    },

    /**
     * Display a message to the console.
     * @returns {Promise} a true-resolved Promise
     */
    consoleLogPromise: function(){
        return new Promise(( resolve, reject ) => {
            console.log( ...arguments );
            resolve( true );
        });
    },

    /**
     * Scans the specified directory for files which match the specified array of regexs
     * @param {string} dir the directory to be scanned
     * @param {Array} regex[] an array of RegExp that each filename must match
     * @returns {Array} an array of objects { path,json }
     * @throws {coreError}
     */
     dirScanSync: function( dir, regex ){
        msg.debug( 'utils.dirScanSync()', 'dir='+dir );
        if( !dir || typeof dir !== 'string' || !dir.length || dir === '/' || dir.startsWith( '/dev' )){
            throw new coreError( coreError.e.UTILS_DIRINVALID );
        }
        let _regex = regex;
        if( !Array.isArray( regex )){
            _regex = [regex];
        }
        let _matchedFiles = [];
        const _readFiles = fs.readdirSync( dir );
        _readFiles.every(( f ) => {
            let _matched = true;
            _regex.every(( r ) => {
                if( !f.match( r )){
                    _matched = false;
                    return false;
                }
                return true;
            });
            if( _matched ){
                _matchedFiles.push( path.join( dir, f ));
            }
            return true;
        });
        msg.debug( 'found ', _matchedFiles, '(count='+_matchedFiles.length+')' );
        let _result = [];
        _matchedFiles.every(( f ) => {
            const _json = utils.jsonReadFileSync( f );
            _result.push({ path:f, json:_json });
            return true;
        });
        return _result;
    },

    /**
     * @param {integer} pid the PID of the process to check
     * @returns {Promise} which will will resolves with [{ pid, user, time, etime }], or false
     */
     isAlivePid: function( pid ){
        msg.debug( 'utils.isAlivePid()', 'pid='+pid );
        return new Promise(( resolve, reject ) => {
            ps({ pid:pid, fields:[ 'pid','user','time','etime' ]})
                .then(( res ) => {
                    msg.debug( 'utils.isAlivePid()', 'pid='+pid, 'resolved with res', res );
                    resolve( res.length === 1 ? res : false );
                }, ( rej ) => {
                    msg.debug( 'utils.isAlivePid()', 'pid='+pid, 'rejected, resolving falsy' );
                    resolve( false );
                })
                .catch(( e ) => {
                    msg.error( 'utils.isAlivePid()', 'pid='+pid, 'resolving falsy', e.name, e.message );
                    resolve( false );
                });
        });
    },

    /**
     * @param {integer} port the port of a TCP server
     * @returns {Promise} which will will resolves with { iz.ack } or false
     */
    isAlivePort: function( port ){
        msg.debug( 'utils.isAlivePort()', 'port='+port );
        return new Promise(( resolve, reject ) => {
            utils.tcpRequest( port, 'iz.ping' )
                .then(( res ) => {
                    msg.debug( 'utils.isAlivePort()', 'port='+port, 'resolved with res', res );
                    resolve( res );
                }, ( rej ) => {
                    msg.debug( 'utils.isAlivePort()', 'port='+port, 'rejected, resolving falsy' );
                    resolve( false );
                })
                .catch(( e ) => {
                    msg.error( 'utils.isAlivePort()', 'port='+port, 'resolving falsy', e.name, e.message );
                    resolve( false );
                });
        });
    },

    /**
     * https://stackoverflow.com/questions/14636536/how-to-check-if-a-variable-is-an-integer-in-javascript
     * @param {*} value the value to test
     * @returns {true|false}
     */
    isInt: function( value ){
        if( isNaN( value )){
            return false;
        }
        var x = parseFloat( value );
        return( x | 0 ) === x;
    },

    /**
     * synchronously read a JSON file
     * @returns {JSON|null} the object (may be empty) or null if ENOENT error
     * @throws {coreError}, unless ENOENT which is sent to coreLogger
     * Note:
     *  As this function is called very early in the program, it cannot makes use of msg() helpers.
     */
    jsonReadFileSync: function( fname ){
        coreLogger.debug( 'utils.jsonReadFileSync()', 'fname='+fname );
        let _json = null;
        try {
            _json = JSON.parse( fs.readFileSync( fname, { encoding: 'utf8' }));
        } catch( e ){
            if( e.code !== 'ENOENT' ){
                throw new coreError( e );
            }
            coreLogger.debug( 'utils.jsonReadFileSync()', fname+': file not found or not readable' );
            _json = null;
        }
        return _json;
    },

    /**
     * synchronously remove a key from JSON file
     * @param {string} fname the full pathname of the file
     * @param {string} key the first-level key to be removed
     * @returns {JSON} the new JSON content
     * Note:
     *  When removing the last key, we rather unlink the file to not leave an empty file in the run dir.
     */
    jsonRemoveKeySync: function( fname, key, deleteEmpty=true ){
        msg.debug( 'utils.jsonRemoveKeySync()', 'fname='+fname, 'key='+key, 'deleteEmpty='+deleteEmpty );
        let _json = utils.jsonReadFileSync( fname ) || {};
        const _orig = { ..._json };
        delete _json[key];
        if( deleteEmpty && ( !_json || !Object.keys( _json ).length )){
            utils.unlink( fname );
            _json = null;
        } else {
            utils.jsonWriteFileSync( fname, _json, _orig );
        }
        return _json;
    },

    /**
     * synchronously writes the given non-null object into path
     *  if the orig object is provided (not null not undefined), then it is compared with the found file
     *  to make sure if has not been updated since the program has read the file
     * @param {string} fname the full pathname of the file
     * @param {Object} obj the data to be written, expected JSON
     * @param {Object} orig the original data read from this file, to be compared with data which will be read in the disk
     *  ti make sure there has been no modifications of the file by another process
     * @returns {Object} the written data
     * @throws {coreError}
     */
    jsonWriteFileSync: function( fname, obj, orig ){
        msg.debug( 'utils.jsonWriteFileSync()', 'fname='+fname, obj, orig );
        let e = utils.makeFnameDirExists( fname );
        if( e ){
            msg.error( 'utils.jsonWriteFileSync().makeFnameDirExists()', e.name, e.message );
            throw new coreError( e );
        }
        // if an original object is provided, then try to make sure the current file is unchanged
        if( orig ){
            const current = utils.jsonReadFileSync( fname ) || {};
            if( !deepEqual( orig, current )){
                msg.info( 'utils.jsonWriteFileSync() fname '+fname+' has changed on the disk, refusing the update' );
                msg.debug( orig );
                msg.debug( current );
                throw new coreError( coreError.e.UTILS_FILECHANGED );
            }
        }
        // at last actually writes the content
        //  hoping for no race conditions between these two blocks of code
        try {
            fs.writeFileSync( fname, JSON.stringify( obj ));
        } catch( e ){
            msg.error( 'utils.jsonWriteFileSync().writeFileSync()', e.name, e.message );
            throw new coreError( e );
        }
        return obj;
    },

    /**
     * make sure the target directory exists
     * @param {string} dir the full pathanme of the directory
     * @throws {coreError}
     * Note:
     *  As this function is called very early in the program, it cannot makes use of msg() helpers.
     */
    makeDirExists: function( dir ){
        coreLogger.debug( 'utils.makeDirExists()', 'dir='+dir );
        // make sure the target directory exists
        try{
            fs.mkdirSync( dir, { recursive: true });
        } catch( e ){
            throw new coreError( e );
        }
    },

    /**
     * make sure the target directory of the filename exists
     * @param {string} fname the full pathanme of the file
     */
    makeFnameDirExists: function( fname ){
        utils.makeDirExists( path.dirname( fname ));
    },

    /**
     * Sends a request to a server, expecting a single JSON as an answer.
     * @param {integer} port the TCP port to request (on locahost)
     * @param {string} command a command to send
     * @returns {Promise} which will resolves with the received answer, or rejects with the catched or received error
     */
    tcpRequest: function( port, command ){
        msg.debug( 'utils.tcpRequest()', 'port='+port, 'command='+command );
        return new Promise(( resolve, reject ) => {
            try {
                const client = net.createConnection( port, () => {
                    client.write( command );
                });
                client.on( 'data', ( data ) => {
                    const _bufferStr = new Buffer.from( data ).toString();
                    const _json = JSON.parse( _bufferStr );
                    // only the client knows when it has to end the answer channel
                    //client.end();
                    msg.debug( 'utils.tcpRequest() resolves with', _json );
                    resolve( _json );
                });
                client.on( 'error', ( e ) => {
                    msg.error( 'utils.tcpRequest().on(\'error\') ', e.name, e.code, e.message );
                    reject( e.code );
                });
                client.on( 'end', ( m ) => {
                    msg.info( 'utils.tcpRequest().on(\'end\')', m );
                    resolve( true );
                });
            } catch( e ){
                msg.error( 'utils.tcpRequest().catch()', e.name, e.message );
                reject( e.message );
            }
        });
    },

    /**
     * Sends a message to a server, without waiting for any answer.
     * @param {integer} port the TCP port to request (on locahost)
     * @param {string} message the message to send
     */
    tcpSend: function( port, message ){
        msg.debug( 'utils.tcpSend()', 'port='+port, 'command='+message );
        try {
            const client = net.createConnection( port, () => {
                client.write( message );
                client.end();
            });
        } catch( e ){
            msg.error( 'utils.tcpSend().catch()', e.name, e.message );
        }
    },

    /**
     * Delete a file from the filesystem
     * @param {string} fname the full pathname of the file to delete
     * @throws {coreError}
     */
    unlink: function( fname ){
        msg.debug( 'utils.unlink()', 'fname='+fname );
        try {
            fs.unlinkSync( fname );
        } catch( e ){
            msg.error( 'utils.unlink().catch()', e.name, e.message );
            throw new coreError( e );
        }
    },

    /**
     * @param {*} result the result to be used as final resolution value
     * @param {Promise} promiseFn the test Promise, which eventually resolves to true (condition is met) or false (timed out)
     * @param {*} promiseParms an object to be passed to promiseFn as arguments
     * @param {integer} timeout the timeout (ms) to be waited for the promiseFn be resolved
     * @returns {Promise} a resolved promise, with result value
     */
    waitFor: function( result, promiseFn, promiseParms, timeout ){
        msg.debug( 'utils.waitFor() timeout='+timeout );
        let _end = Date.now()+timeout;
        return new Promise(( outResolve, reject ) => {
            const _outerTest = function(){
                return new Promise(( inResolve, reject ) => {
                    const _innerTest = function(){
                        promiseFn( promiseParms )
                            .then(( res ) => {
                                if( res ){
                                    msg.debug( 'utils.waitFor() resolves to true' );
                                    inResolve( true );
                                } else if( Date.now() > _end ){
                                    msg.debug( 'utils.waitFor() timed out, resolves to false' );
                                    inResolve( false );
                                } else {
                                    setTimeout( _innerTest, 10 );
                                }
                            })
                            .catch(( e ) => {
                                    msg.error( 'utils.waitFor().catch()', e.name, e.message );
                                    inResolve( true );
                            });
                    };
                    _innerTest();
                })
            };
            _outerTest()
                .then(( res ) => {
                    result.waitFor = res;
                    outResolve( result );
                });
        });
    }
}
