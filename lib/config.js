/*
 * coreConfig
 *  Manages the application configuration in storageDir/config/iztiar.json
 *  Manages the controllers configurations in storageDir/config/controller-<name>.json
 * 
 *  Not yet a Logger at instanciation time, but command-line has been successfullly parsed.
 */
import path from 'path';

import { Iztiar, coreCmdline, coreLogger, utils } from './imports.js';

const co = {
    confDir: 'config',
    logDir: 'logs',
    pidDir: 'run'
};

// sort of 'schema' of configuration files
const st = {
    // only the application *runtime* global object Iztiar does hold the <storageDir>
    app: {
        logLevel: Iztiar.c.app.default
    },
    // the controller configuration
    // only the controller *runtime* config does hold the 'name'
    controller: {
        // name is only held by the runtime config
        account: {
            name: Iztiar.c.app.name,
            uid: Iztiar.c.app.default,
            gid: Iztiar.c.app.default
        },
        controller: {
            name: Iztiar.c.app.default,
            port: Iztiar.c.controller.port
        },
        manager: {
            enabled: Iztiar.c.manager.enabled,
            name: Iztiar.c.app.none
        },
        broker: {
            enabled: Iztiar.c.broker.enabled,
            port: Iztiar.c.broker.port
        }
    }
};

let configs = {};

// fill up the application configuration, replacing unset keys with their computed runtime values
//  returns the completed json
function _fillupAppConfig( json ){
    const _opts = coreCmdline.getOptions();
    // log level
    if( !json.logLevel || _opts.loglevel !== coreConfig.getDefaultLoglevel()){
        json.logLevel = _opts.loglevel;
    }
    json.logLevel = json.logLevel.toUpperCase();
    return json;
}

// extend the default configuration with:
//  - config: the hard-coded default configuration
//  - _json: the json read from configuration file
//  - _opts: the command-line options if applies to this same named controller
function _fillupControllerConfig( config, name ){
    const _name = coreConfig.getControllerRuntimeName( name );
    const _json = _readJson( _name, st.controller );
    const _opts = coreCmdline.getOptions();
    //coreLogger.debug( 'app config ', config );
    //coreLogger.debug( 'controller\'s service _name=', _name );
    //coreLogger.debug( 'controller\' configuration _json=', _json );
    //coreLogger.debug( 'command-line _opts=', _opts );

    // account name
    if( _json.account && _json.account.name ){
        config.account.name = _json.account.name;
    }
    if( _opts.name === name && _opts.user !== coreConfig.getDefaultAccountName()){
        config.account.name = _opts.user;
    }
    // account uid
    if( _json.account && _json.account.uid ){
        config.account.uid = _json.account.uid;
    }
    if( _opts.name === name && _opts.uid !== coreConfig.getDefaultAccountUid()){
        config.account.uid = _opts.uid;
    }
    // account gid
    if( _json.account && _json.account.gid ){
        config.account.gid = _json.account.gid;
    }
    if( _opts.name === name && _opts.gid !== coreConfig.getDefaultAccountGid()){
        config.account.gid = _opts.gid;
    }
    // controller name
    if( _json.controller && _json.controller.name ){
        config.controller.name = _json.controller.name;
    }
    if( _opts.name === name ){
        config.controller.name = _opts.name;
    }
    // controller listening port
    if( _json.controller && _json.controller.port ){
        config.controller.port = _json.controller.port;
    }
    if( _opts.name === name && _opts.controller !== coreConfig.getDefaultControllerPort()){
        config.controller.port = _opts.controller;
    }
    // manager name
    if( _json.manager && _json.manager.name ){
        config.manager.name = _json.manager.name;
    }
    if( _opts.name === name && _opts.manager !== coreConfig.getDefaultManagerName()){
        config.manager.name = _opts.manager;
    }
    config.manager.enabled = ( 
        config.manager.name.length && 
        config.manager.name !== Iztiar.c.app.default && 
        config.manager.name !== Iztiar.c.app.none );
    // broker enabled
    if( _json.broker && _json.broker.enabled ){
        config.broker.enabled = _json.broker.enabled;
    }
    if( _opts.name === name && _opts.messageBus !== coreConfig.getDefaultBrokerEnabled()){
        config.broker.enabled = _opts.messageBus;
    }
    // broker listening port
    if( _json.broker && _json.broker.port ){
        config.broker.port = _json.broker.port;
    }
    if( _opts.name === name && _opts.broker !== coreConfig.getDefaultBrokerPort()){
        config.broker.port = _opts.broker;
    }
    return config;
}

// take a name identifying the configuration file in <configDir>
//  returns the read JSON, which may be empty
function _readJson( name, def ){
    return utils.jsonReadFileSync( path.join( Iztiar.getStorageDir(), co.confDir, name+'.json' )) || def;
}

export class coreConfig {

    /**
     * the runtime configuration applicable to a controller and maybe its message broker is:
     *  - the application configuration (read and filled up at instanciation time)
     *  * plus *
     *  - this controller configuration
     * these two things maybe being overriden by the command-line options
     */
     static getControllerRuntimeConfig( name ){
        const _name = coreConfig.getControllerRuntimeName( name );
        //console.log( configs[Iztiar.c.app.name] );
        if( !configs[_name] ){
            let _config = {
                ...configs[Iztiar.c.app.name],
                ...st.controller
            };
            _config = _fillupControllerConfig( _config, name );
            configs[_name] = _config;
        }
        return configs[_name];
    }

    /**
     * 
     * @param {*} name 
     * @returns 
     */
    static getControllerRuntimeName( name ){
        return coreConfig.getControllerRuntimePrefix() + ( name || Iztiar.c.app.default );
    }

    /**
     * 
     * @returns 
     */
    static getControllerRuntimePrefix(){
        return 'controller-';
    }

    /**
     * 
     * @returns 
     */
     static getDefaultAccountName(){
        return st.controller.account.name;
    }

    /**
     * returned default has to be resolved when actually creating the user
     */
     static getDefaultAccountGid(){
        return st.controller.account.gid;
    }

    /**
     * returned default has to be resolved when actually creating the user
     */
     static getDefaultAccountUid(){
        return st.controller.account.uid;
    }

    /**
     * 
     * @returns 
     */
     static getDefaultBrokerEnabled(){
        let _def = st.controller.broker.enabled;
        if( _def === Iztiar.c.app.default ){
            _def = true;
            st.controller.broker.enabled = _def;
        }
        return _def;
    }

    /**
     * 
     * @returns 
     */
    static getDefaultBrokerPort(){
        return st.controller.broker.port;
    }

    /**
     * 
     * @returns 
     */
     static getDefaultControllerName(){
        return st.controller.name;
    }

    /**
     * 
     * @returns 
     */
    static getDefaultControllerPort(){
        return st.controller.controller.port;
    }

    /**
     * 
     * @returns 
     */
     static getDefaultLoglevel(){
        let _def = st.app.logLevel;
        if( _def === Iztiar.c.app.default ){
            _def = coreLogger.l.INFO;
            st.app.logLevel = _def;
        }
        return _def;
    }

    /**
     * 
     * @returns 
     */
     static getDefaultManagerName(){
        return st.controller.manager.name;
    }

    /**
     * hard-coded value, not stored as a config key
     */
    static getDefaultStorageDir(){
        return path.join( '/var/lib', Iztiar.c.app.name );
    }

    /**
     * Returns the full pathname of the log file for the application
     *  All controllers and servers will log into this file
     * 
     * @returns 
     */
     static getLogFilename(){
        return path.join( Iztiar.getStorageDir(), co.logDir, Iztiar.c.app.name+'.log' );
    }

    /**
     * 
     * @returns 
     */
    static getLogLevel(){
        const _conf = configs[Iztiar.c.app.name ];
        return _conf.logLevel;
    }

    /**
     * 
     * @returns 
     */
    static getPidDir(){
        return path.join( Iztiar.getStorageDir(), co.pidDir );
    }

    /**
     *  Load application configuration file
     *  Filling up the result with suitable default value when needed
     */
    static load(){
        const _name = Iztiar.c.app.name;
        let _json = _readJson( _name, st.app );
        _json = _fillupAppConfig( _json );
        // cache the application config
        configs[_name] = _json;
    }
}
