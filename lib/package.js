/*
 * corePackage
 *  Parse the package.json of this ES module.
 */
import semver from 'semver';
import { fileURLToPath } from 'url';
import { sprintf } from 'sprintf-js';

import { coreLogger, utils } from './imports.js';

const err = {
    NODE_INCORRECT_VERSION: 'corePackage::node-incorrect-version'
};

let content = null;

function _loadContent(){
    try {
        content = utils.jsonReadFileSync( fileURLToPath( new URL( '../package.json', import.meta.url )));
    } catch( e ){
        coreLogger.error( e );
    }
    return content;
}

export class corePackage {

    /**
     * @returns the version of the package
     * @type string
     */
    static getVersion(){
        if( !content ){
            _loadContent();
        }
        return content.version;
    }

    /**
     * @returns the minimal version of Node.js required by this package
     * @type string
     */
    static getRequiredNodeVersion(){
        if( !content ){
            _loadContent();
        }
        return content.engines.node;
    }

    /**
     * Checks the running Node.js version against the version required in package.json.
     * Fine is nothing is required.
     * Fine also if prerequisite is satisfied.
     * 
     * @param none
     * @returns a coreResult object, or null
     */
    static isRunningNodeAcceptable(){
        const required = corePackage.getRequiredNodeVersion();
        if( !required ){
            return null;
        }
        const running = process.version;
        if( semver.satisfies( running, required )){
            return null;
        }
        let message = sprintf(
            'Iztiar requires Node.js v %s while you are currently running v %s.' +
            ' You may need to upgrade your installation of Node.js.' +
            ' See https://git.io/JTKEF', this.getRequiredNodeVersion(), process.version
            );
        return new coreResult( message, err.NODE_INCORRECT_VERSION );
    }
}
