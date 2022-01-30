/*
 * coreConfig
 *
 *  Manages the application configuration in storageDir/config/iztiar.json
 *  Manages the controllers configurations in storageDir/config/controller-<name>.json
 * 
 * Not yet a Logger at instanciation time, but command-line has been successfullly parsed.
 */
import fs from 'fs';
import path from 'path';

import { coreBroker } from './broker.js';
import { coreCmdline } from './cmdline.js';
import { coreController } from './controller.js';
import { coreLogger } from './logger.js';
import { Iztiar } from './global.js';

export class coreConfig {

    static const = {
        confDir: 'config',
        pidDir: 'run'
    };

    // sort of 'schema' of configuration files
    static s = {
        // only the application *runtime* global object Iztiar does hold the <storageDir>
        app: {
            logLevel: Iztiar.const.default
        },
        // the controller configuration
        // only the controller *runtime* config does hold the 'name'
        controller: {
            account: {
                name: Iztiar.const.app,
                uid: Iztiar.const.default,
                gid: Iztiar.const.default
            },
            controller: {
                port: coreController.defaults.port
            },
            manager: {
                enabled: Iztiar.const.default,
                name: Iztiar.const.default
            },
            broker: {
                enabled: Iztiar.const.default,
                port: coreBroker.defaults.port
            }
        }
    };

    static configs = {};

    static GetDefaultLoglevel(){
        let _def = coreConfig.s.app.logLevel;
        if( _def === Iztiar.const.default ){
            _def = coreLogger.level.INFO;
            coreConfig.s.app.logLevel = _def;
        }
        return _def;
    }

    // hard-coded value, not stored as a config key
    static GetDefaultStorageDir(){
        return path.join( '/var/lib', Iztiar.const.app );
    }

    static GetDefaultAccountName(){
        return coreConfig.s.controller.account.name;
    }

    // returned default has to be resolved when actually creating the user
    static GetDefaultAccountUid(){
        return coreConfig.s.controller.account.uid;
    }

    // returned default has to be resolved when actually creating the user
    static GetDefaultAccountGid(){
        return coreConfig.s.controller.account.gid;
    }

    static GetDefaultControllerName(){
        return Iztiar.const.default;
    }

    static GetDefaultControllerPort(){
        return coreConfig.s.controller.controller.port;
    }

    static GetDefaultManagerName(){
        return coreConfig.s.controller.manager.name;
    }

    static GetDefaultBrokerPort(){
        return coreConfig.s.controller.broker.port;
    }

    // instanciating a new coreConfig means that we load and analyzes and filled up the application configuration
    constructor(){
        coreLogger.debug( 'instanciating new coreConfig()' );

        const _name = Iztiar.const.app;
        let _json = this._readJson( _name, coreConfig.s.app );
        _json = this._fillupAppConfig( _json );
        // cache the application config
        coreConfig.configs[_name] = _json;

        return this;
    }

    // fill up the application configuration, replacing unset keys with their computed runtime values
    //  returns the completed json
    _fillupAppConfig( json ){
        const _opts = Iztiar.rt.cmdline.getOptions();
        // log level
        if( !json.logLevel || _opts.loglevel !== coreConfig.GetDefaultLoglevel()){
            json.logLevel = _opts.loglevel;
        }
        json.logLevel = json.logLevel.toUpperCase();
        return json;
    }

    // extend the default configuration with:
    //  - the json configuration file
    //  - the command-line options if applies to this same named controller
    _fillupControllerConfig( config, name ){
        const _name = this.getControllerRuntimeName( name );
        const _json = this._readJson( _name, coreConfig.s.controller );
        const _opts = Iztiar.rt.cmdline.getOptions();

        config.name = name;

        // account name
        if( _json.account && _json.account.name ){
            config.account.name = _json.account.name;
        }
        if( _opts.name === name && _opts.user !== coreConfig.GetDefaultAccountName()){
            config.account.name = _opts.user;
        }
        // account uid
        if( _json.account && _json.account.uid ){
            config.account.uid = _json.account.uid;
        }
        if( _opts.name === name && _opts.uid !== coreConfig.GetDefaultAccountUid()){
            config.account.uid = _opts.uid;
        }
        // account gid
        if( _json.account && _json.account.gid ){
            config.account.gid = _json.account.gid;
        }
        if( _opts.name === name && _opts.gid !== coreConfig.GetDefaultAccountGid()){
            config.account.gid = _opts.gid;
        }
        // controller listening port
        if( _json.controller && _json.controller.port ){
            config.controller.port = _json.controller.port;
        }
        if( _opts.name === name && _opts.controller !== coreConfig.GetDefaultControllerPort()){
            config.controller.port = _opts.controller;
        }
        // manager name
        if( _json.manager && _json.manager.name ){
            config.manager.name = _json.manager.name;
        }
        if( _opts.name === name && _opts.manager !== coreConfig.GetDefaultManagerName()){
            config.manager.name = _opts.manager;
        }
        // broker listening port
        if( _json.broker && _json.broker.port ){
            config.broker.port = _json.broker.port;
        }
        if( _opts.name === name && _opts.broker !== coreConfig.GetDefaultBrokerPort()){
            config.broker.port = _opts.broker;
        }
        return config;
    }

    // take a name identifying the configuration file in <configDir>
    //  returns the read JSON, which may be empty
    _readJson( name, def ){
        const _path = path.join( Iztiar.rt.storageDir, coreConfig.const.confDir, name+'.json' );
        coreLogger.debug( 'coreConfig::_readJson() %s', _path );
        let _json = def;
        try {
            _json = JSON.parse( fs.readFileSync( _path, { encoding: 'utf8' }));
        } catch( e ){
            if( e.code !== 'ENOENT' ){
                throw e;
            }
            coreLogger.warn( _path+': configuration file not found or not readable' );
        }
        return _json;
    }

    // the runtime configuration applicable to a controller and maybe its message broker is:
    //  - the application configuration (read and filled up at instanciation time)
    //  * plus *
    //  - this controller configuration
    // these two things maybe being overriden by the command-line options
    getControllerRuntimeConfig( name ){
        const _name = this.getControllerRuntimeName( name );
        if( !coreConfig.configs[_name] ){
            let _config = {
                ...coreConfig.configs[Iztiar.const.app],
                ...coreConfig.s.controller
            };
            _config = this._fillupControllerConfig( _config, name );
            coreConfig.configs[_name] = _config;
        }
        return coreConfig.configs[_name];
    }

    getControllerRuntimeName( name ){
        return 'controller-' + ( name || Iztiar.const.default );
    }

    getLogLevel(){
        const _conf = coreConfig.configs[Iztiar.const.app];
        return _conf.logLevel;
    }

    getPidDir(){
        return path.join( Iztiar.rt.storageDir, coreConfig.const.pidDir );
    }
}
