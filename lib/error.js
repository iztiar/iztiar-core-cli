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
        CMDLINE_NOACTFOUND: 'coreCmdline: no-action-found',
        CMDLINE_TOOMANYACT: 'coreCmdline: too-many-found-actions',
        CONFIG_NAMEUNSET: 'coreConfig: expected service name, found undefined, null or empty',
        CONTROLLER_BADPROCESS: 'coreController: trying to fork a coreBroker but I\'m not in a coreController process',
        CONTROLLER_BROKERDISABLED: 'coreController: trying to fork a coreBroker while the coreController configuration disable it',
        CONTROLLER_RECURSION: 'coreController: too many recursion levels',
        FORKABLE_APPCONFUNSET: 'coreForkable: service name expected, found undefined, null or empty',
        FORKABLE_CMDUNSET: 'coreForkable: command expected, found undefined, null or empty',
        FORKABLE_CMDUNKNOWN: 'coreForkable: unknwon command',
        FORKABLE_CMDNOTDEFINED: 'coreForkable: undefined command',
        FORKABLE_CONTCONFUNSET: 'coreForkable: runtime configuration expected, found undefined, null or empty',
        FORKABLE_NAMEUNSET: 'coreForkable: service name expected, found undefined, null or empty',
        PACKAGE_NODEVERSION: 'corePackage: incorrect-node-version',
        RUNFILE_EMPTYCONTENT: 'coreRunfile: a key is specified but has no content',
        RUNFILE_NAMEUNSET: 'coreRunfile: service name expected, found undefined, null or empty',
        RUNFILE_PATHUNSET: 'coreRunfile: path expected, found undefined, null or empty',
        RUNFILE_PIDUNSET: 'coreRunfile: pid expected, found undefined, null or empty',
        RUNFILE_PORTUNSET: 'coreRunfile: port expected, found undefined, null or empty',
        UTILS_DIRINVALID: 'utils: directory path expected, found undefined, null, empty or invalid',
        UTILS_FILECHANGED: 'utils: file has changed on the disk, so refusing to update it'
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