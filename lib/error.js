/*
 * coreError
 *  This is our preferred error type
 * 
 * See:
 *  https://stackoverflow.com/questions/1382107/whats-a-good-way-to-extend-error-in-javascript
 *  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
 */
import { coreLogger } from './imports.js';

export class coreError extends Error {
    
    static e = {
        CMDLINE_NOACTFOUND: 'coreCmdline::no-action-found',
        CMDLINE_TOOMANYACT: 'coreCmdline::too-many-found-actions',
        FORKABLE_CONFIGUNSET: 'runtime configuration expected, found undefined, null or empty',
        FORKABLE_CONFIGNAMEUNSET: 'controller service name expected, found undefined, null or empty',
        FORKABLE_CMDUNSET: 'command expected, found undefined, null or empty',
        FORKABLE_CMDUNKNOWN: 'unknwon command',
        FORKABLE_CMDNOTDEFINED: 'undefined command',
        PACKAGE_NODEVERSION: 'incorrect-node-version',
        RUNFILE_NAMEUNSET: 'controller service name expected, found undefined, null or empty',   
        UTILS_DIRINVALID: 'directory path expected, found undefine, null, empty or invalid',
        UTILS_FILECHANGED: 'file has changed on the disk, so refusing to update it'
    };

    /**
     * @param {string|Error} message the error message, or an Error object
     * @returns {coreError}
     */
    constructor( message, ...args ){
        super( message, ... args );

        this.name = this.constructor.name;// || 'coreError';
        
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if( Error.captureStackTrace ){
            Error.captureStackTrace( this, coreError );
        }

        return this;
    }
}
