/*
 * cli-start.js

 * Starts a controller
 * If not prevented against, the controller will then startup its message bus broker.
 * From the main CLI process point of view, we have so to manage one or two Promises.
 * 
 * See also cmdline.js for a more detailed rationale.
 */
import chalk from 'chalk';
import { Iztiar, coreBroker, coreConfig, coreController, coreForkable, coreLogger, coreRunfile } from './imports.js';

export function cliStart( serviceName, appConfig, cbExit ){

    const _processName = Iztiar.envForked();
    const _sceConfig = coreConfig.getControllerFilledConfig( serviceName );
    coreLogger.debug( 'cliStart()', 'processName='+_processName, 'appConfig=', appConfig, 'sceConfig=', _sceConfig );

    // main CLI process
    //  fork a coreController if nothing prevent that
    //  we have next to wait for coreController IPC startup message
    if( !_processName ){
        console.log( 'Trying to start '+serviceName+' service(s)...' );

        // slavishly refuse to start a service those one part or all is already running
        const _processes = coreRunfile.processes( serviceName ); 
        //console.log( _processes );
        if( _processes[Iztiar.c.forkable.CONTROLLER] ||
            ( _sceConfig.broker.enabled && _processes[Iztiar.c.forkable.BROKER] )){
                console.log( chalk.yellow( 'Refusing to start already running service(s):' ));
                for( const _forkable in _processes ){
                    console.log( chalk.yellow( '   '+_forkable+': '+JSON.stringify( _processes[_forkable] )));
                }
                let _promise = Promise.resolve( true );
                _promise.code = 0;
                return _promise;
        }
        console.log( 'No service is not already running (fine)' );

        // we expect to receive, not only the startup messages of the server(s) we start ourselves, 
        //  but also the forwarded startup messages from server(s) started by the formers
        //  (knowing that we manage only a one-level hierarchy)
        let _ipcTarget = coreController.startupComputeTargetsCount( _sceConfig );
        let _ipcCount = 0;

        // + (main) MYNAME coreController successfully startup, listening on port 24001
        // + (MYNAME coreController) MYNAME-managed coreBroker successfully startup, listening on port 24002 (message bus on port 24003)
        // + (MYNAME coreController) ANOTHER (MYNAME-managed) coreController successfully startup, listening on port 24001
        // + (MYNAME coreController) ANOTHER-managed coreBroker successfully startup, listening on port 24001 (message bus on port 24003)
        const _ipcToConsole = function( serviceName, messageData ){
            const _forkable = Object.keys( messageData )[0];

            let _msg = '(';
            if( messageData.event === 'startup' ){
                _msg += 'main';
            } else {
                _msg += serviceName+' coreController';
            }
            _msg += ') ';

            if( messageData.event === 'startup' ){
                _msg += messageData.name+' '+_forkable;
            } else if( _forkable === Iztiar.c.forkable.BROKER ){
                _msg += messageData[_forkable].manager+'-managed '+_forkable;
            } else {
                _msg += messageData.name+' ('+serviceName+'-managed) '+_forkable;
            }

            _msg += ' successfully startup, listening on port '+messageData[_forkable].port;

            if( _forkable === Iztiar.c.forkable.BROKER ){
                _msg += ' (message bus on port ' + messageData[_forkable].messaging.port + ')';
            }

            console.log( ' + '+_msg );
        }

        const _ipcOnMessage = function( child, messageData ){
            //console.log( '_ipcOnMessage called', messageData.name, Object.keys( messageData )[0], messageData.event );
            _ipcToConsole( serviceName, messageData );
            coreForkable.startupOnIPCMessage( child, messageData );
            //console.log( 'about to increment ipcCount to', 1+_ipcCount );
            _ipcCount += 1;
        }

        // timeout promise
        //  say we count 1000ms per server to fork and start
        //  will eventually reject with a {string} reason
        const timeoutPromise = new Promise(( resolve, reject ) => {
            const timeout_ms = 1000*_ipcTarget;
            const timeoutId = setTimeout(() => {
                clearTimeout( timeoutId );
                //console.log( 'timeout reached, rejecting with reason', timeout_ms );
                reject( 'timeout ('+timeout_ms+'ms)' );
            }, timeout_ms )
        });

        // target promise
        //  will eventually resolve with a {number} ipcTarget success value
        const targetPromise = new Promise(( resolve, reject ) => {
            const intervalId = setInterval(() => {
                if( _ipcCount === _ipcTarget ){
                    clearInterval( intervalId );
                    //console.log( 'ipcCount has reached ipcTarget, resolving with value', _ipcTarget );
                    resolve( _ipcTarget );
                }
            }, 10 );
        });

        // fork our coreController
        console.log( ' - (main) requesting for coreController to start...' );
        coreForkable.startupFork( Iztiar.c.forkable.CONTROLLER, _ipcOnMessage );

        // if the then() condition here manages both success and failure cases, then the cli-runner.js clause
        //  only receives a success, with the exitCode set here in the failure case (fine)
        return Promise.race([ timeoutPromise, targetPromise ])
            .then( success => {
                    //console.log( 'success', success );
                    console.log( chalk.green( 'Service(s) '+serviceName+' successfully started.' ));
                    return Promise.resolve( Iztiar.exitCode());
                }, failure => {
                    //console.log( 'failure', failure );
                    Iztiar.exitCode( 1+Iztiar.exitCode());
                    return Promise.resolve( Iztiar.exitCode());
                });

    // coreController forked process
    //  have to actually start the controller
    //  have also to fork managed controllers and message broker
    } else if( _processName === Iztiar.c.forkable.CONTROLLER ){
        const controller = new coreController( serviceName, appConfig, _sceConfig );
        controller.startupStart();

        // fork the message bus broker if not prevented from
        if( _sceConfig.broker.enabled ){
            console.log( ' - (coreController) requesting for coreBroker to start...' );
            coreForkable.startupFork( Iztiar.c.forkable.BROKER, coreForkable.startupOnIPCMessage );
        }

        // starts the managed controllers (each one being able to maybe run a coreBroker (even if useless))
        _sceConfig.managed.every(( c ) => {
            console.log( ' - (coreController) requesting for '+c+' coreController to start...' );
            coreForkable.startupFork( Iztiar.c.forkable.CONTROLLER, coreForkable.startupOnIPCMessage );
        })

    // coreBroker forked process
    //  start the messaging subservers
    } else if( _processName === Iztiar.c.forkable.BROKER ){
        const broker = new coreBroker( serviceName, appConfig, _sceConfig );
        broker.startupStart();
    }

    return new Promise(() => {});   // never resolves
}
