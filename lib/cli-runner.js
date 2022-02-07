/*
 * Main command-line interface
 * Is both responsible of
 *  - command-line options management
 *  - main controller run
 */
import { Iztiar, coreCmdline, coreConfig, coreLogger, corePackage } from './imports.js';
import { cliRestart } from './cli-restart.js';
import { cliStart } from './cli-start.js';
import { cliStatus } from './cli-status.js';
import { cliStop } from './cli-stop.js';
import { cliZzz } from './cli-zz.js';

if( !Iztiar.envForked()){
    console.log( coreCmdline.copyright());
    //console.log( process );
}

let errs = 0;
let appConfig = null;
let serviceName = null;
let verbose = true;

// Due to well-known chicken-and-egg problem, we have to first parse the command-line options.
//  This will define our <storageDir>, which also define the <logDir> and the <configDir>.
//  So we will be able to load configuration files, and then initialize our Logger...

// parse command-line arguments
//  get the filled application configuration
//   which let us initialize our logger
try {
    coreCmdline.parse()
    appConfig = coreConfig.getAppFilledConfig();
    coreLogger.init( Iztiar.c.app.name, appConfig );
    coreLogger.debug( 'command-line arguments successfully parsed: will run \''+coreCmdline.getAction()+'\' action' );
    serviceName = coreCmdline.options().name;
    //console.log( 'serviceName', serviceName );
    //console.log( 'coreCmdline.options()', coreCmdline.options());
} catch( e ){
    coreLogger.error( e.name, e.message );
    errs += 1;
}

// check the environment
// check running Node.js against the required version from package.json
if( !Iztiar.envForked()){
    try{
        corePackage.isRunningNodeAcceptable();
        coreLogger.debug( 'Node.js version successfully checked' );
    } catch( e ){
        coreLogger.error( e.name, e.message );
        errs += 1;
    }
}

// the action must return a Promise, so that we will wait for its resolution (or rejection)
//  the exit code of the process if searched for in process.Iztiarcode (to be attached by the action)
let promise = null;
switch( coreCmdline.getAction()){
    case 'install':
        break;
    case 'uninstall':
        break;
    case 'start':
        promise = cliStart( serviceName, appConfig );
        break;
    case 'stop':
        cliStop( serviceName );
        break;
    case 'restart':
        promise = cliRestart( serviceName );
        break;
    case 'status':
        promise = cliStatus( serviceName );
        break;
    case 'list':
        break;
    case 'zz':
        cliZzz();
        break;
    default:
        break;
}

// We are waiting here for the Promise returned by the action be settled, either resolved or rejected.
// We are prepared to managed both success and failure, but do not modify in either cases the exit code of the process.
// It is up to the action to compute whether its own code is successful or not.
if( promise && promise instanceof Promise ){
    //console.log( 'waiting for promise.then' );
    promise.then(( successValue ) => {
        //console.log( 'promise.then success', successValue );
        const code = Iztiar.exitCode() || 0;
        if( verbose ){
            console.log( 'Exiting with code', code );
        }
        process.exit( code );
    }, ( failureReason ) => {
        console.log( 'promise.then failure', failureReason );
        const code = Iztiar.exitCode() || 0;
        if( verbose ){
            console.log( 'Exiting with code', code );
        }
        process.exit( code );
    });
}
