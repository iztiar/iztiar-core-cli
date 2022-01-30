/*
 * Main command-line interface
 * Is both responsible of
 *  - command-line options management
 *  - main controller run
 */
import { coreCmdline } from './cmdline.js';
import { coreConfig } from './config.js';
import { coreForkable } from './forkable.js';
import { coreLogger } from './logger.js';
import { corePackage } from './package.js';
import { coreStart } from './cli-start.js';
import { coreStatus } from './cli-status.js';
import { Iztiar } from './global.js';

let errs = 0;
let result = null;

// Due to well-known chicken-and-egg problem, we have to first parse the command-line options.
//  This will define our <storageDir>, which also define the <logDir> and the <configDir>.
//  So we will be able to load configuration files, and then initialize our Logger...

// try to interpret our own package.json (know who we are)
Iztiar.rt.package = new corePackage();

// parse command-line arguments
Iztiar.rt.cmdline = new coreCmdline();
const cmdline = Iztiar.rt.cmdline; // as a shorter
if( result = cmdline.parse()){
    coreLogger.error( result );
    errs += 1;
} else {
    coreLogger.info( 'command-line arguments successfully parsed: will run '+cmdline.getAction());
}

// successful command-line parsing implies that we have our <storageDir>
//  time to load configurations
Iztiar.rt.config = new coreConfig();

// initialize our logger
Iztiar.rt.log = new coreLogger({ name: Iztiar.const.app, config: Iztiar.rt.config });

// check the environment
// check running Node.js against the required version from package.json

if( result = Iztiar.rt.package.isRunningNodeAcceptable()){
    coreLogger.error( result );
    errs += 1;
} else {
    coreLogger.info( 'Node.js version successfully checked' );
}

// the exit from CLI must execute at the end of the main command management
//  and when the created server (if any) has bound -> when the action is done
//  or when a terminating error has been detected
// forked servers will terminate itself, and elsewhere
//  just manage here the main process
const exitCli = function( code ){
    if( !process.env[coreForkable.id] ){
        coreLogger.debug( 'exitCli() flowEnded='+Iztiar.rt.flowEnded+' action='+Iztiar.rt.action );
        if( Iztiar.rt.flowEnded && Iztiar.rt.action ){
            let _code = 
                typeof code === 'number' ? code : 
                ( typeof code === 'function' ? code() :
                ( Iztiar.rt.action === Iztiar.action.DONE ? 0 : 1 ));
            coreLogger.info( 'quitting main process ('+Iztiar.rt.action+' action) with code '+_code );
            process.exit( _code );
        }
        coreLogger.debug( 'doesn\'t exit (yet).....' );
    }
}

switch( cmdline.getAction()){
    case 'install':
        break;
    case 'uninstall':
        break;
    case 'start':
        coreStart( cmdline.getOptions().name, exitCli );
        break;
    case 'stop':
        break;
    case 'restart':
        break;
    case 'status':
        coreStatus( cmdline.getOptions().name, exitCli );
        break;
    case 'List':
        break;
    default:
        break;
}

Iztiar.rt.flowEnded = true;
exitCli();
