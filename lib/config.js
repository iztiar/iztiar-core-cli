/*
 * coreConfig
 *  Manages the application configuration in storageDir/config/iztiar.json
 *  Manages the controllers configurations in storageDir/config/controller-<name>.json
 * 
 * Application configuration
 *  - logLevel {string} the log level
 *  - account
 *      name {string} the name of the account which manages the application
 *      uid {integer} the UID of the account
 *      gid {integer} the GID of the account
 * 
 * Application runtime available from getAppFilledConfig()
 *  - logLevel {string} the log level (from configuration+command-line)
 *  - account
 *      name
 *      uid
 *      gid
 *  - storageDir {string} the full pathname of the storage directory (from command-line)
 * 
 * Controller configuration
 *  - controller
 *      port {integer} the listening port of the controller
 *  - broker
 *      enabled {boolean} whether a coreBroker is attached to this controller
 *      controller
 *          port {integer} the communication (with the controller) listening port
 *      messaging
 *          port {integer} the messaging listening port
 *  - managed {string[]} an array of the names of managed controllers
 *  - manager {string} name of the manager controller
 *
 * Note:
 *  Having both non empty 'managed' and 'manager' keys is an invalid configuration
 *  as a coreController is either the main (manager) controller *or* a managed one.
 * 
 *  Configuration files (application + maybe named service) are scanned once at the first call;
 *  there is no need to explicitly initialize this class.
 * 
 *  Maybe not yet a Logger at instanciation time, but command-line has been successfullly parsed.
 */
import path from 'path';

import { Iztiar, coreCmdline, coreError, coreLogger, utils } from './imports.js';

const co = {
    confDir: 'config',
    logDir: 'logs',
    runDir: 'run'
};

// sort of 'schema' of configuration files
const st = {
    // only the application *runtime* global object Iztiar does hold the <storageDir>
    app: {
        logLevel: Iztiar.c.app.logLevel,
        account: {
            name: Iztiar.c.app.name,
            uid: Iztiar.c.app.default,
            gid: Iztiar.c.app.default
        },
    },
    // the controller configuration
    controller: {
        broker: {
            enabled: Iztiar.c.broker.enabled,
            controller: {
                port: Iztiar.c.broker.controllerPort,
            },
            messaging: {
                port: Iztiar.c.broker.messagingPort
            }
        },
        controller: {
            port: Iztiar.c.controller.port
        },
        managed: [
            Iztiar.c.app.none
        ],
        manager: Iztiar.c.app.none
    }
};

// each loaded configuration file is stored here after having been filled-up
//  key is app.name or service name
//  content is filled-up config
let _configs = {};
let _storageDir = null;

// build the application runtime configuration
//  take the read application configuration (if any),
//  overriding it with command-line options (if apply)
// returns the completed json
function _fillupAppConfig( json ){
    let _filled = { ...json };
    const _opts = coreCmdline.options();
    // log level
    if( !json.logLevel || _opts.loglevel !== coreConfig.getDefaultLoglevel()){
        _filled.logLevel = _opts.loglevel;
    }
    _filled.logLevel = _filled.logLevel.toLowerCase();
    // account name
    if( !Object.keys( json ).includes( 'account' )){
        json.account = {};
        _filled.account = {};
    }
    if( !json.account.name || _opts.user !== coreConfig.getDefaultAccountName()){
        _filled.account.name = _opts.user;
    }
    // account uid
    if( !json.account.uid || _opts.uid !== coreConfig.getDefaultAccountUid()){
        _filled.account.uid = _opts.uid;
    }
    // account gid
    if( !json.account.gid || _opts.gid !== coreConfig.getDefaultAccountGid()){
        _filled.account.gid = _opts.gid;
    }
    // storage dir
    //  the storage directory is presented as a key of application runtime configuration
    //  but has first been stored outside of it for our internal needs (and prevent inifinite recursion)
    _filled.storageDir = _storageDir;

    return _filled;
}

// build the controller runtime configuration
//  take the read controller configuration (if any)
//  overriding ti with command-line options (if apply)
// returns the completed json
function _fillupControllerConfig( json, name ){
    let _filled = { ...json };
    const _opts = coreCmdline.options();
    // broker enabled
    if( !Object.keys( json ).includes( 'broker' )){
        json.broker = {};
        _filled.broker = {};
    }
    if( !Object.keys( json.broker ).includes( 'enabled' )){
        _filled.broker.enabled = coreConfig.getDefaultBrokerEnabled();
        if( _opts.name === name && _opts.messagingBus !== coreConfig.getDefaultBrokerEnabled()){
            _filled.broker.enabled = _opts.messagingBus;
        }
    }
    // broker controller port
    if( !Object.keys( json.broker ).includes( 'controller' )){
        json.broker.controller = {};
        _filled.broker.controller = {};
    }
    if( !json.broker.controller.port ){
        _filled.broker.controller.port = coreConfig.getDefaultBrokerControllerPort();
        if( _opts.name === name && _opts.brokerPort !== coreConfig.getDefaultBrokerControllerPort()){
            _filled.broker.controller.port = _opts.brokerPort;
        }
    }
    // broker messaging port
    if( !Object.keys( json.broker ).includes( 'messaging' )){
        json.broker.messaging = {};
        _filled.broker.messaging = {};
    }
    if( !json.broker.messaging.port ){
        _filled.broker.messaging.port = coreConfig.getDefaultBrokerMessagingPort();
        if( _opts.name === name && _opts.messagingPort !== coreConfig.getDefaultBrokerMessagingPort()){
            _filled.broker.messaging.port = _opts.messagingPort;
        }
    }
    // controller listening port
    if( !Object.keys( json ).includes( 'controller' )){
        json.controller = {};
        _filled.controller = {};
    }
    if( !json.controller.port ){
        _filled.controller.port = coreConfig.getDefaultControllerPort();
        if( _opts.name === name && _opts.controllerPort !== coreConfig.getDefaultControllerPort()){
            _filled.controller.port = _opts.controllerPort;
        }
    }
    // managed names
    //  no command-line option at the moment
    if( !Object.keys( json.broker ).includes( 'managed' )){
        json.managed = [];
        _filled.managed = [];
    }
    // manager name
    if( !json.manager ){
        _filled.manager = coreConfig.getDefaultManagerName();
        if( _opts.name === name && _opts.manager !== coreConfig.getDefaultManagerName()){
            _filled.manager = _opts.manager;
        }
        if( json.manager === coreConfig.getDefaultManagerName()){
            _filled.manager='';
        }
    }
    return _filled;
}

    /*
     *  Load once application configuration file
     *  Filling up the result with suitable default value when needed
     *  coreCmdline.options().name
     */
    function _load(){
        _appli_json = _fillupAppConfig( _readJson( Iztiar.c.app.name, st.app ));
        // cache the application config
        configs[_name] = _json;
    }

// take a name identifying the configuration file in <configDir>
//  returns the read JSON, which may be empty
function _readJson( name ){
    return utils.jsonReadFileSync( path.join( coreConfig.storageDir(), co.confDir, name+'.json' )) || {};
}

export class coreConfig {

    /**
     * @returns {JSON} the rough content of the application configuration file, maybe empty
     * @throws {coreError}
     * Doesn't update internal _configs.
     */
    static getAppFilledConfig(){
        let _filled = _configs[Iztiar.c.app.name];
        if( !_filled ){
            _configs[Iztiar.c.app.name] = _fillupAppConfig( coreConfig.getAppRawConfig());
            _filled = _configs[Iztiar.c.app.name];
        }
        return _filled;
    }

    /**
     * @returns {JSON} the rough content of the application configuration file, maybe empty
     * @throws {coreError}
     * Doesn't update internal _configs.
     */
     static getAppRawConfig(){
        return utils.jsonReadFileSync( path.join( coreConfig.storageDir(), co.confDir, Iztiar.c.app.name+'.json' )) || {};
    }

    /**
     * @param {string} name the (configuration) name of the controller service
     * @returns {string} the runtime name of the controller service
     * @throws {coreError}
     */
    static getControllerFileName( name ){
        if( !name || typeof name !== 'string' || !name.length ){
            throw new coreError( coreError.e.CONFIG_NAMEUNSET );
        }
        return coreConfig.getControllerFilePrefix() + ( name || Iztiar.c.app.default );
    }

    /**
     * @param {string} name the (configuration) name of the controller service
     * @returns {string} the prefix of the runtime controller service name
     */
    static getControllerFilePrefix(){
        return 'controller-';
    }

    /**
     * @param {string} name the name of the controller service
     * @returns {Object} the filled configuration, taking into account both configuration file and command-line options
     * @throws {coreError}
     */
    static getControllerFilledConfig( name ){
        let _filled = _configs[name];
        if( !_filled ){
            _configs[name] = _fillupControllerConfig( coreConfig.getControllerRawConfig( name ));
            _filled = _configs[name];
        }
        return _filled;
    }

    /**
     * @param {string} name the (configuration) name of the controller service
     * @returns {JSON} the rough content of the application configuration file, maybe empty
     * @throws {coreError}
     * Doesn't update internal _configs.
     */
    static getControllerRawConfig( name ){
        const _fname = coreConfig.getControllerFileName( name );
        return utils.jsonReadFileSync( path.join( coreConfig.storageDir(), co.confDir, _fname+'.json' )) || {};
    }

    /**
     * @returns {string} the default service account name
     * Account is used as owner and runner of services
     * This has to be resolved at installation time, and be written in the application configuration file
     */
     static getDefaultAccountName(){
        return st.app.account.name;
    }

    /**
     * @returns {string} the default GID for the service account
     */
     static getDefaultAccountGid(){
        return st.app.account.gid;
    }

    /**
     * @returns {string} the default UID for the service account
     */
     static getDefaultAccountUid(){
        return st.app.account.uid;
    }

    /**
     * @returns {boolean} whether the message broker is enabled by default
     */
     static getDefaultBrokerEnabled(){
        return st.controller.broker.enabled;
    }

    /**
     * @returns {integer} the default TCP port number on which the broker is listening for controller communications
     */
    static getDefaultBrokerControllerPort(){
        return st.controller.broker.controller.port;
    }

    /**
     * @returns {integer} the default TCP port number on which the broker manages its messaging bus
     */
    static getDefaultBrokerMessagingPort(){
        return st.controller.broker.messaging.port;
    }

    /**
     * @returns {string} the default service controller name
     */
     static getDefaultControllerName(){
        return Iztiar.c.app.default;
    }

    /**
     * @returns {integer} the default TCP port number on which the controller is listening
     */
    static getDefaultControllerPort(){
        return st.controller.controller.port;
    }

    /**
     * @returns {boolean} whether to force the stop of a service
     */
    static getDefaultForceStop(){
        return false;
    }

    /**
     * @returns {string} the default log level of the application
     */
    static getDefaultLoglevel(){
        return st.app.logLevel;
    }

    /**
     * @returns {string} the default controller manager name
     */
    static getDefaultManagerName(){
        return st.controller.manager.name;
    }

    /**
     * @returns {string} the default storage dir
     */
    static getDefaultStorageDir(){
        return path.join( '/var/lib', Iztiar.c.app.name );
    }

    /**
     * @returns {string} the default full pathname of the log file for the application
     *  All controllers and servers will log into this file
     */
    static logFilename(){
        return path.join( coreConfig.storageDir(), co.logDir, Iztiar.c.app.name+'.log' );
    }

    /**
     * 
     * @returns {string} the runtime directory where JSON runfiles are stored
     */
    static getPidDir(){
        return path.join( coreConfig.storageDir(), co.runDir );
    }

    /**
     * Getter/Setter
     * @param {string} dir the storage directory
     * @returns {string} the runtime storage directory
     */
     static storageDir( dir ){
         if( dir && typeof dir === 'string' && dir.length ){
             _storageDir = dir;
         }
        return _storageDir;
    }
}
