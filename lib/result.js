/*
 * coreResult
 *  This is the preferred return format of synchronous functions
 * 
 * See:
 *  https://stackoverflow.com/questions/1382107/whats-a-good-way-to-extend-error-in-javascript
 *  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
 */
import { coreLogger } from './imports.js';

export class coreResult extends Error {
    
    static e = {
        CODE_PARENTNOTSET: 'code error: parent should have been set, found null or undefined',
        CONFIG_UNSET: 'runtime configuration expected, found undefined, null or empty',
        CONFIG_NAME_UNSET: 'controller service name expected, found undefined, null or empty',
        DIR_INVALID: 'directory path expected, found undefine, null, empty or invalid',
        FILE_CHANGED: 'file has changed on the disk, so refusing to update it',
        FORKABLE_INVALID: 'forkable expected, found undefined, null, empty or invalid',
        NAME_UNSET: 'controller service name expected, found undefined, null or empty'
    };

    /**
     * @param {string} message may be a string which will be the name of a newly created Error, or an Error object
     * @param {string} name 
     * @returns {coreResult}
     */
    constructor( message, name ){
        
        if( typeof message === 'string' ){
            super( message );
        } else if( typeof message === 'Object' && message instanceof 'Error' ){
            super( message.message );
        } else {
            super( message );
        }
        //console.log( 'instanciating new coreResult() cause %o message %o', cause, message );
        //coreLogger.debug( 'instanciating new coreResult() cause %o message %o', cause, message );

        this.name = name || 'coreResult';
        
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if( Error.captureStackTrace ){
            Error.captureStackTrace( this, coreResult );
        }

        coreLogger.error( this );

        return this;
    }
}
