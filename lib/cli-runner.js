/*
 * Main command-line interface
 * Is both responsible of
 *  - command-line options management
 *  - main controller run
 */
import { Iztiar, coreCmdline, coreConfig, coreForkable, coreLogger, corePackage } from './imports.js';
import { cliStart } from './cli-start.js';
import { cliStatus } from './cli-status.js';
import { cliStop } from './cli-stop.js';

let errs = 0;
let result = null;
let forker = null;

// Due to well-known chicken-and-egg problem, we have to first parse the command-line options.
//  This will define our <storageDir>, which also define the <logDir> and the <configDir>.
//  So we will be able to load configuration files, and then initialize our Logger...

Iztiar.setProcName( process.env[Iztiar.c.forkable.uuid] );

// parse command-line arguments
if( result = coreCmdline.parse()){
    coreLogger.error( result );
    errs += 1;
} else {
    coreLogger.info( 'command-line arguments successfully parsed: will run \''+coreCmdline.getAction()+'\' action' );
}

// successful command-line parsing implies that we have got now our <storageDir>
//  time to load configurations
coreConfig.load();

// initialize our logger
const log = new coreLogger( Iztiar.c.app.name );

// check the environment
// check running Node.js against the required version from package.json
if( result = corePackage.isRunningNodeAcceptable()){
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
    coreLogger.debug( 'entering exitCli()' );
    if( forker && !Iztiar.getProcName()){
        coreLogger.debug( 'exitCli() flowEnded='+forker.flowEnded+' actionDone='+forker.ready );
        if( forker.flowEnded && forker.ready ){
            let _code = 
                typeof code === 'number' ? code : 
                ( typeof code === 'function' ? code() : 0 );
            coreLogger.info( 'quitting main process with code '+_code );
            process.exit( _code );
        }
        coreLogger.debug( 'exitCli() do not quit (yet...)' );
    }
};

switch( coreCmdline.getAction()){
    case 'install':
        break;
    case 'uninstall':
        break;
    case 'start':
        forker = cliStart( coreCmdline.getOptions().name, exitCli );
        break;
    case 'stop':
        cliStop( coreCmdline.getOptions().name );
        break;
    case 'restart':
        break;
    case 'status':
        forker = cliStatus();
        break;
    case 'List':
        break;
    default:
        break;
}

if( forker ){
    forker.flowEnded = true;
}
exitCli();
//console.log( 'quitting' );
