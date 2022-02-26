/*
 * corePackage
 *  Parse the package.json of this ES module.
 */
import semver from 'semver';
import { fileURLToPath } from 'url';
import { sprintf } from 'sprintf-js';

import { coreError, coreLogger, msg, utils } from './imports.js';

let content = null;

function _loadContent(){
    try {
        content = utils.jsonReadFileSync( fileURLToPath( new URL( '../package.json', import.meta.url )));
    } catch( e ){
        msg.error( e.name, e.message );
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
     * @throws {coreError}
     */
    static isRunningNodeAcceptable( verbose ){
        const required = corePackage.getRequiredNodeVersion();
        if( required ){
            const running = process.version;
            if( semver.satisfies( running, required )){
                let _msg = sprintf(
                    'Iztiar requires Node.js v %s and you are currently running v %s: fine', required, running );
                    msg.verbose( _msg );
            } else {
                let _msg = sprintf(
                    'Iztiar requires Node.js v %s while you are currently running v %s.' +
                    ' You may need to upgrade your installation of Node.js.' +
                    ' See https://git.io/JTKEF', required, running
                    );
                msg.error( _msg );
                throw new coreError( coreError.e.PACKAGE_NODEVERSION );
            }
        }
    }
}
