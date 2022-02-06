/*
 * utils.js
 */
import deepEqual from 'deepequal';
import fs from 'fs';
import net from 'net';
import path from 'path';
import ps from 'ps';

import { coreError, coreLogger } from './imports.js';

export const utils = {

    /**
     * Scans the specified directory for files which match the specified array of regexs
     * @param {string} dir the directory to be scanned
     * @param {Array} regex[] an array of RegExp that each filename must match
     * @returns {Array} an array of objects { path,json }
     * @throws {coreError}
     */
     dirScanSync: function( dir, regex ){
        coreLogger.debug( 'utils.dirScanSync()', 'dir='+dir );
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
        coreLogger.debug( 'found ', _matchedFiles );
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
     * @returns {Promise} which will will resolves with [{ pid, user, time, etime }], maybe empty
     */
     isAlivePid: function( pid ){
        coreLogger.debug( 'utils.isAlivePid()', 'pid='+pid );
        return new Promise(( resolve, reject ) => {
            ps({ pid:pid, fields:[ 'pid','user','time','etime' ]})
                .then(( res ) => {
                    resolve( res.length === 1 ? res : false );
                })
                .catch(( e ) => {
                    coreLogger.error( 'utils.isAlivePid()', e.name, e.message );
                    resolve( false );
                });
        });
    },

    /**
     * @param {integer} port the port of a TCP server
     * @returns {Promise} which will will resolves with { iz.ack } or false
     */
    isAlivePort: function( port ){
        coreLogger.debug( 'utils.isAlivePort()', 'port='+port );
        return new Promise(( resolve, reject ) => {
            utils.tcpRequest( port, 'iz.ping' )
                .then(( res ) => {
                    //console.log( 'res', res );
                    resolve( res );
                }, ( rej ) => {
                    //console.log( 'rej', rej );
                    resolve( false );
                })
                .catch(( e ) => {
                    coreLogger.error( 'utils.isAlivePort()', e.name, e.message );
                    resolve( false );
                });
        });
    },

    /**
     * synchronously read a JSON file
     * @returns {JSON|null} the object (may be empty) or null if ENOENT error
     * @throws {coreError}, unless ENOENT which is sent to coreLogger
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
            coreLogger.debug( 'utils.jsonReadFileSync() '+fname+': file not found or not readable' );
            _json = null;
        }
        return _json;
    },

    /**
     * synchronously remove a key from JSON file
     * @returns {JSON} the new JSON content
     */
    jsonRemoveKeySync: function( fname, key ){
        coreLogger.debug( 'utils.jsonRemoveKeySync()', 'fname='+fname, 'key='+key );
            let _json = utils.jsonReadFileSync( fname ) || {};
            const _orig = { ..._json };
            delete _json[key];
            utils.jsonWriteFileSync( fname, _json, _orig );
        return _json;
    },

    /**
     * synchronously writes the given non-null object into path
     *  if the orig object is provided (not null not undefined), then it is compared with the found file
     *  to make sure if has not been updated since the program has read the file
     *  return a coreError or null
     */
    jsonWriteFileSync: function( fname, obj, orig ){
        coreLogger.debug( 'utils.jsonWriteFileSync()', 'fname='+fname, obj, orig );
        let e = utils.makeFnameDirExists( fname );
        if( e ){
            return e;
        }
        // if an original object is provided, then try to make sure the current file is unchanged
        if( orig ){
            const current = utils.jsonReadFileSync( fname ) || {};
            if( !deepEqual( orig, current )){
                coreLogger.info( 'utils.jsonWriteFileSync() fname '+fname+' has changed on the disk, refusing the update' );
                coreLogger.debug( orig );
                coreLogger.debug( current );
                return new coreError( coreError.e.UTILS_FILECHANGED );
            }
        }
        // at last actually writes the content
        //  hoping for no race conditions between these two blocks of code
        try {
            fs.writeFileSync( fname, JSON.stringify( obj ));
        } catch( e ){
            return new coreError( e );
        }
        return null;
    },

    /**
     * make sure the target directory exists
     * return coreError or null
     */
    makeDirExists: function( dir ){
        coreLogger.debug( 'utils.makeDirExists()', 'dir='+dir );
        // make sure the target directory exists
        try{
            fs.mkdirSync( dir, { recursive: true });
        } catch( e ){
            return new coreError( e );
        }
    },

    /**
     * make sure the target directory of the filename exists
     * return coreError or null
     */
    makeFnameDirExists: function( fname ){
        coreLogger.debug( 'utils.makeFnameDirExists()', 'fname='+fname );
        utils.makeDirExists( path.dirname( fname ));
    },

    /**
     * Sends a request to a server, expecting a single JSON as an answer.
     * @param {integer} port the TCP port to request (on locahost)
     * @param {string} command a command to send
     * @returns {Promise} which will resolves with the received answer, or rejects with the catched or received error
     */
    tcpRequest: function( port, command ){
        coreLogger.debug( 'utils.tcpRequest()', 'port='+port, 'command='+command );
        return new Promise(( resolve, reject ) => {
            try {
                const client = net.createConnection( port, () => {
                    client.write( command+'\r\n' );
                });
                client.on( 'data', ( data ) => {
                    const _str = new Buffer.from( data ).toString();
                    const _json = JSON.parse( _str.split( '\r\n' )[0] );
                    client.end();
                    resolve( _json );
                });
                client.on( 'error', ( e ) => {
                    coreLogger.error( 'utils.tcpRequest().on(\'error\') ', e.name, e.code, e.message );
                    reject( e.code );
                });
            } catch( e ){
                coreLogger.error( 'utils.tcpRequest().catch(e)', e.name, e.message );
                reject( e.message );
            }
        });
    }
}
