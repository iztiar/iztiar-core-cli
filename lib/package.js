/*
 * corePackage
 *  The first initialized class (as the version is used by coreCmdline)
 *  So no Logger neither Config at instanciation time
 * 
 *  Parse the package.json of this ES module.
 */
import semver from 'semver';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { sprintf } from 'sprintf-js';

import { coreLogger } from './logger.js';
import { coreResult } from './result.js';

export class corePackage {

    static e = {
        NODE_INCORRECT_VERSION: 'corePackage::node-incorrect-version'
    };

    _jsonPath = null;
    _jsonContent = null;

    constructor(){
        coreLogger.debug( 'instanciating new corePackage()' );
        this._jsonContent = this._loadJson();
        return this;
    }

    _loadJson(){
        this._jsonPath = fileURLToPath( new URL( '../package.json', import.meta.url ));
        coreLogger.debug( 'corePackage::_loadJson() %s', this._jsonPath );
        return JSON.parse( fs.readFileSync( this._jsonPath, { encoding: 'utf8' }));
    }

    /**
     * @returns the version of the package
     * @type string
     */
    getVersion(){
        return this._jsonContent.version;
    }

    /**
     * @returns the minimal version of Node.js required by this package
     * @type string
     */
    getRequiredNodeVersion(){
        return this._jsonContent.engines.node;
    }

    /**
     * Checks the running Node.js version against the version required in package.json.
     * Fine is nothing is required.
     * Fine also if prerequisite is satisfied.
     * 
     * @param none
     * @returns a coreResult object, or null
     */

    isRunningNodeAcceptable(){
        const required = this.getRequiredNodeVersion();
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
        return new coreResult( corePackage.e.NODE_INCORRECT_VERSION, message );
    }
}
