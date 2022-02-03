/*
 * corePackage
 *  Parse the package.json of this ES module.
 */
import semver from 'semver';
import { fileURLToPath } from 'url';
import { sprintf } from 'sprintf-js';

import { coreError, coreLogger, utils } from './imports.js';

let content = null;

function _loadContent(){
    try {
        content = utils.jsonReadFileSync( fileURLToPath( new URL( '../package.json', import.meta.url )));
    } catch( e ){
        coreLogger.error( e.name, e.message );
    }
    return content;
}

export class corePackage {

    /**
     * @returns {string} the version of the package
     */
    static getVersion(){
        if( !content ){
            _loadContent();
        }
        return content.version;
    }

    /**
     * @returns {string} the minimal version of Node.js required by this package
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
     * @returns {boolean} whether the Node.js running version is accepted
     * @throws {coreError}
     */
    static isRunningNodeAcceptable(){
        const required = corePackage.getRequiredNodeVersion();
        if( !required ){
            return true;
        }
        const running = process.version;
        if( semver.satisfies( running, required )){
            return true;
        }
        let message = sprintf(
            'Iztiar requires Node.js v %s while you are currently running v %s.' +
            ' You may need to upgrade your installation of Node.js.' +
            ' See https://git.io/JTKEF', this.getRequiredNodeVersion(), process.version
            );
        coreLogger.error( message );
        throw new coreError( coreError.e.PACKAGE_NODEVERSION );
    }
}
