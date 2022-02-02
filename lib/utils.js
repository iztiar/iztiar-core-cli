/*
 * utils.js
 */
import deepEqual from 'deepequal';
import fs from 'fs';
import path from 'path';

import { coreLogger } from './logger.js';
import { coreResult } from './result.js';

export const utils = {

    /**
     * Scans the specified directory for files which match the specified array of regexs
     * @param {string} dir the directory to be scanned
     * @param {Array} regex[] an array of RegExp that each filename must match
     * @returns {Array} an array of objects {path,json}
     * @throws {coreResult}
     */
     dirScanSync: function( dir, regex ){
        if( !dir || typeof dir !== 'string' || !dir.length || dir === '/' || dir.startsWith( '/dev' )){
            throw new coreResult( coreResult.e.DIR_INVALID );
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
     * synchronously read a JSON file
     *  returns the JSON object (may be empty) or null if ENOENT error
     *  throws a coreResult if exeception not ENOENT
     */
    jsonReadFileSync: function( fname ){
        coreLogger.debug( 'utils.jsonReadFileSync() '+fname );
        let _json = null;
        try {
            _json = JSON.parse( fs.readFileSync( fname, { encoding: 'utf8' }));
        } catch( e ){
            if( e.code !== 'ENOENT' ){
                throw new coreResult( e );
            }
            coreLogger.warn( 'utils.jsonReadFileSync() '+fname+': file not found or not readable' );
            _json = null;
        }
        return _json;
    },

    /**
     * synchronously remove a key from JSON file
     * returning the new JSON content
     */
    jsonRemoveKeySync: function( fname, key ){
        coreLogger.debug( 'utils.jsonRemoveKeySync() '+fname+' key='+key );
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
     *  return a coreResult or null
     */
    jsonWriteFileSync: function( fname, obj, orig ){
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
                return new coreResult( coreResult.e.FILE_CHANGED );
            }
        }
        // at last actually writes the content
        //  hoping for no race conditions between these two blocks of code
        try {
            fs.writeFileSync( fname, JSON.stringify( obj ));
        } catch( e ){
            return new coreResult( e );
        }
        return null;
    },

    /**
     * make sure the target directory exists
     * return coreResult or null
     */
    makeDirExists: function( dir ){
        // make sure the target directory exists
        try{
            fs.mkdirSync( dir, { recursive: true });
        } catch( e ){
            return new coreResult( e );
        }
    },

    /**
     * make sure the target directory of the filename exists
     * return coreResult or null
     */
    makeFnameDirExists: function( fname ){
        utils.makeDirExists( path.dirname( fname ));
    }
}
