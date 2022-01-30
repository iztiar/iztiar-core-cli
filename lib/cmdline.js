/**
 * coreCmdline
 * Define here the command-line management
 * At the time, we have no Logger neither Config.
 * 
 * An action (install|uninstall|start|stop|restart|startus|list) must be specified.
 * 
 * The 'status' command doesn't need to be addressed to any particular controller as long as we are
 *  able to address the application storage folder.
 * 
 * Apart from 'status', all other actions address a named controller or the default one.
 * 
 * When starting (resp. installing) a controller, one should take care of:
 *  - either allow the message bus startup at the same time
 *  - or identify the manager controller against which this starting (resp. installing) controller
 *      will have to register.
 * 
 * Nothing forces this behavior in order to let every body as much as freedom as possible, but you
 * have to be warned: the behavior risks to be rather unpredictable if several message brokers try
 * to deal with same messages, or if there is no message broker at all, or if several controllers
 * are not able to communicate between each others.
 */
import { Command, Option } from 'commander';
import { sprintf } from 'sprintf-js';

import { coreConfig } from './config.js';
import { coreLogger } from './logger.js';
import { coreResult } from './result.js';
import { Iztiar } from './global.js';

export class coreCmdline extends Command {

    static subCommands = [
        { name: 'install', description: 'install the named controller service'},
        { name: 'uninstall', description: 'uninstall the named controller service'},
        { name: 'start', description: 'start the named controller'},
        { name: 'stop', description: 'stop the named controller'},
        { name: 'restart', description: 'restart the named controller'},
        { name: 'status', description: 'display the status of known controllers'},
        { name: 'list', description: 'list installed plugins'},
    ];

    static err = {
        ACTION_NOT_FOUND: 'coreCmdline::action-not-found',
        ACTION_TOO_MANY: 'coreCmdline::action-too-many'
    };

    _options = null;                    // options read in command-line
    _subFound = {};                     // whether the subcommands has been found in the command-line
    _subCount = 0;                      // count of found subcommands

    constructor(){
        super();
        coreLogger.debug( 'instanciating new coreCmdline()' );
        const self = this;

        // define command-line options
        this
            .name( Iztiar.const.app )

            .option( '-l|--loglevel <level>', 'logging level', coreConfig.GetDefaultLoglevel())
            .option( '-s|--storage <path>', 'path to storage directory', coreConfig.GetDefaultStorageDir())
            .option( '-n|--name <name>', 'manage the named controller', coreConfig.GetDefaultControllerName())
            .option( '-u|--user <user>', 'the account to create which will manage the controllers', coreConfig.GetDefaultAccountName())
            .option( '--uid <uid>', 'the UID of the user', coreConfig.GetDefaultAccountUid())
            .option( '--gid <gid>', 'the GID of the user', coreConfig.GetDefaultAccountGid())
            .option( '-c|--controller <port>', 'the listening port of the controller', coreConfig.GetDefaultControllerPort())
            .option( '-m|--manager <name>', 'name of the manager controller if any', coreConfig.GetDefaultManagerName())
            .option( '-b|--broker <port>', 'the listening port of the message broker', coreConfig.GetDefaultBrokerPort())

            .addOption( new Option( '--no-message-bus', 'doesn\'t start the message bus' ).default( true, 'start them at the same time'))

            .version( Iztiar.rt.package.getVersion(), '-V|--version', 'output the current version, gracefully exiting' )
        ;

        // define sub-commands (start, stop, and so on)
        //  unfortunatly, the action handler is called before all command-line options have been parsed
        coreCmdline.subCommands.every(( sub ) => {
            const name = sub.name;
            //console.log( 'declaring %s subcommand', name );
            self
                .command( sub.name )
                .description( sub.description )
                .action(( opts, commander ) => {
                    self._subFound[name] = true;
                    self._subCount += 1;
                    //console.log( 'coreCmdline::'+name+'() action handler subCount='+self._subCount );
                });
            self._subFound[name] = false;
            return true;
        });

        return this;
    }

    // parse the command-line
    //  commander doesn't return when:
    //  - no argument has been specified: displays help, exiting with code 1
    //  - unknown argument has been found: displays an error message, exiting with code 1
    // subcommand action handler is executed before parse() returns
    // returns coreResult or null
    parse(){
        super.parse( process.argv );
        this._options = this.opts();
        //console.log( 'coreCmdline::parse() options %o', this._options );
        //console.log( 'coreCmdline::parse() remainging %o', this.args );
        //console.log( 'coreCmdline::parse() this %o', this );

        // this is the actual, real, definitive <storageDir> as coreCmdline (thanks to commander)
        //  takes care of providing the default value if nothing has been specified in the command-line 
        Iztiar.rt.storageDir = this._options.storage;

        // subcommands: one and only one must have been specified
        //  but cf. #7 subcommands starting with the second one are just ignored
        //console.log( 'coreCmdline::parse() subCount='+this._subCount );
        if( this._subCount !== 1 ){
            let message = sprintf( 'Found %u subcommands while only one was expected', this._subCount );
            return new coreResult( this._subCount ? coreCmdline.err.ACTION_TOO_MANY : coreCmdline.err.ACTION_NOT_FOUND, message );
        }

        return null;
    }

    // return options detected in the command-line
    getOptions(){
        return this._options;
    }

    // return found subcommand (if one and only one has been detected)
    getAction(){
        let ret = null;
        if( this._subCount === 1 ){
            Object.keys( this._subFound ).every(( key ) => {
                if( this._subFound[key] ){
                    ret = key;
                    return false; // stop iteration
                }
                return true;
            })
        }
        return ret;
    }
}
