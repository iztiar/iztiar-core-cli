/*
 * msg.js
 *  Manage both console output and file logging.
 *  See coreLogger.js for a full description of console level logging.
 */
import chalk from 'chalk';

import { Iztiar, coreError, coreLogger } from './imports.js';

let _singleton = null;

// param: log level (lowercase)
// param: console level (lowercase)
// param: color console
function _log(){
    if( !_singleton ){
        throw new coreError( coreError.e.MSG_NOT_INIT );
    }
    //console.log( 'msg._log()', arguments );
    const _logLevel = arguments[0];
    const _consoleLevel = arguments[1].toUpperCase();
    const color = arguments[2];

    let _args = [ ...arguments ];
    _args.splice( 0, 3 );

    if( _logLevel ){
        coreLogger[_logLevel]( ..._args );
    }

    //console.log( '_singleton.consoleLevel='+_singleton._consoleLevel, '_consoleLevel='+_consoleLevel, 'Iztiar.c.verbose[_consoleLevel]='+Iztiar.c.verbose[_consoleLevel] );

    if( !Iztiar.envForked() && _singleton._consoleLevel >= Iztiar.c.verbose[_consoleLevel] ){
        if( color ){
            console.log( color( ..._args ));
        } else {
            console.log( ..._args );
        }
    }
}

export class msg {

    /*
     * a way of managing logging before any Logger be instanciated
     *  generalizing that, calling these static methods is the only API the application needs to know
     */
    static error(){
        _log( 'error', 'error', chalk.red, ...arguments );
    }

    static warn(){
        _log( 'warn', 'warn', chalk.yellow, ...arguments );
    }

    static out(){
        _log( null, 'normal', null, ...arguments );
    }

    static info(){
        _log( 'info', 'verbose', chalk.cyan, ...arguments );
    }

    static verbose(){
      _log( 'info', 'verboseplus', chalk.white, ...arguments );
    }

    static debug(){
      _log( 'debug', 'debug', chalk.blue, ...arguments );
    }

    /**
     * The class is initialized once at the startup of the programe, juste after command-line have been parsed.
     * @param {string} appName the application name
     * @param {Object} appConfig the filled-up runtime application configuration
     */
    static init( appName, appConfig){
        if( _singleton ){
            throw new coreError( coreError.e.MSG_ALREADY_INIT );
        }
        _singleton = new msg( appName, appConfig );
    }

    _appName = null;
    _consoleLevel = null;

    /**
     * A singleton just to have some protected storage space
     * @constructor
     * @param {string} appName the application name
     * @param {Object} appConfig the filled-up runtime application configuration
     * @returns {msg} a new msg instance
     */
    constructor( appName, appConfig ){
        coreLogger.init( appName, appConfig );
        this._appName = appName;
        this._consoleLevel = appConfig.consoleLevel;
        //console.log( 'this._appName='+this._appName, 'this._consoleLevel='+this._consoleLevel );
        return this;
    }
}
