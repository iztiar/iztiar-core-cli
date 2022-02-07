/**
 * coreCmdline
 *  Parse the command-line options.
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

import { Iztiar, coreConfig, coreError, corePackage } from './imports.js';

const subs = [
    { name: 'install', description: 'install the named controller service' },
    { name: 'uninstall', description: 'uninstall the named controller service' },
    { name: 'start', description: 'start the named controller' },
    { name: 'stop', description: 'stop the named controller' },
    { name: 'restart', description: 'restart the named controller' },
    { name: 'status', description: 'display the status of named controller (\'ALL\' for all)' },
    { name: 'list', description: 'list installed plugins' },
    { name: 'zz', description: 'to be hidden', hidden:true }
];

let _command = null;
let _subFound = {};                    // whether the subcommands has been found in the command-line
let _subCount = 0;                     // count of found subcommands

function _initCommand(){
    const beforeAllText = '';
    // before/after texts are printed respectively just after beforeAll or just before afterAll, so doesn't seem very useful    
    const beforeText = '';
    const afterText = '';
    let afterAllText = '\n Please note that one, and only one, command should be specified.';
    afterAllText += '\n As of the current version, other, surnumerous, commands will just be ignored.';
    afterAllText += '\n It is probable that a next major version will consider that as a runtime error.';
    afterAllText += '\n';
    // define command-line options
    _command = new Command()
        .name( Iztiar.c.app.name )

        .option( '-l|--loglevel <level>', 'logging level', coreConfig.getDefaultLoglevel())
        .option( '-s|--storage <path>', 'path to storage directory', coreConfig.getDefaultStorageDir())
        .option( '-n|--name <name>', 'the name of this controller', coreConfig.getDefaultControllerName())
        .option( '-u|--user <user>', 'the account to create which will manage the controllers', coreConfig.getDefaultAccountName())
        .option( '--uid <uid>', 'the UID of the user', coreConfig.getDefaultAccountUid())
        .option( '--gid <gid>', 'the GID of the user', coreConfig.getDefaultAccountGid())
        .option( '-c|--controller-port <port>', 'the listening port of the controller', coreConfig.getDefaultControllerPort())
        .option( '-m|--manager <name>', 'name of the manager controller if any', coreConfig.getDefaultManagerName())
        .option( '-b|--broker-port <port>', 'the communication port of the message broker', coreConfig.getDefaultBrokerControllerPort())
        .option( '-B|--messaging-port <port>', 'the messaging port of the message broker', coreConfig.getDefaultBrokerMessagingPort())

        .addOption( new Option( '--no-messaging-bus', 'doesn\'t start the messaging bus' ).default( coreConfig.getDefaultBrokerEnabled(), 'start them at the same time'))

        .version( corePackage.getVersion(), '-V|--version', 'output the current version, gracefully exiting' )

        .addHelpText('beforeAll', beforeAllText )
        .addHelpText('before', beforeText )
        .addHelpText('after', afterText )
        .addHelpText('afterAll', afterAllText )
    ;

    // define sub-commands (start, stop, and so on)
    //  unfortunatly, the action handler is called before all command-line options have been parsed
    subs.every(( s ) => {
        const name = s.name;
        //console.log( 'declaring %s subcommand', name );
        _command
            .command( s.name )
            .description( s.description )
            .action(( opts, commander ) => {
                _subFound[name] = true;
                _subCount += 1;
                //console.log( 'coreCmdline::'+name+'() action handler subCount='+self.subCount );
            });
        //if( s.hidden ){
        //    _command.command( s.name ).hideHelp();
        //}
        _subFound[name] = false;
        return true;
    });
}

export class coreCmdline {

    /**
     * @returns {string} the copyright message of the application
     */
    static copyright(){
        let text = Iztiar.c.app.displayedName+' v '+corePackage.getVersion();
        text += '\nCopyright (@) 2020,2021,2022 TheDreamTeam&Consorts (and may the force be with us;))';
        return text;
    }

    /**
     * parse the command-line
     *  commander doesn't return when:
     *  - no argument has been specified: displays help, exiting with code 1
     *  - unknown argument has been found: displays an error message, exiting with code 1
     * subcommand action handler is executed before parse() returns
     * @throws {coreError}
     */
    static parse(){
        if( !_command ){
            _initCommand();
        }
        _command.parse( process.argv );
        //console.log( 'coreCmdline::parse() options %o', this.options );
        //console.log( 'coreCmdline::parse() remainging %o', this.args );
        //console.log( 'coreCmdline::parse() this %o', this );

        // this is the actual, real, definitive <storageDir> as coreCmdline (thanks to commander)
        //  takes care of providing the default value if nothing has been specified in the command-line
        coreConfig.storageDir( _command.opts().storage );

        // subcommands: one and only one must have been specified
        //  but cf. #7 subcommands starting with the second one are just ignored
        //console.log( 'coreCmdline::parse() subCount='+this.subCount );
        if( _subCount === 0 ){
            throw new coreError(  coreError.e.CMDLINE_NOACTFOUND );
        }
        if( _subCount > 1 ){
            throw new coreError(  coreError.e.CMDLINE_TOOMANYACT );
        }
    }

    /**
     * @returns {Object} options detected in the command-line
     */
    static options(){
        //console.log( _command );
        //console.log( _command.opts());
        return _command.opts();
    }

    /**
     * @returns {string|null} found subcommand (if one and only one has been detected)
     */
    static getAction(){
        let ret = null;
        if( _subCount === 1 ){
            Object.keys( _subFound ).every(( key ) => {
                if( _subFound[key] ){
                    ret = key;
                    return false; // stop iteration
                }
                return true;
            })
        }
        return ret;
    }
}
