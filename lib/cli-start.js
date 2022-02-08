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

export function cliStart( serviceName, appConfig ){

    const _processName = Iztiar.envForked();
    const _sceConfig = coreConfig.getControllerFilledConfig( serviceName );
    coreLogger.debug( 'cliStart()', 'processName='+_processName, 'appConfig=', appConfig, 'sceConfig=', _sceConfig );

    // main CLI process
    //  fork a coreController if nothing prevent that
    //  we have next to wait for coreController IPC startup message
    if( !_processName ){
        console.log( 'Trying to start \''+serviceName+'\' service(s)...' );

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
                _msg += messageData[_forkable].name+' '+_forkable;
            } else if( _forkable === Iztiar.c.forkable.BROKER ){
                _msg += messageData[_forkable].manager+'-managed '+_forkable;
            } else {
                _msg += messageData[_forkable].name+' ('+serviceName+'-managed) '+_forkable;
            }

            _msg += ' successfully startup, listening on port '+messageData[_forkable].port;

            if( _forkable === Iztiar.c.forkable.BROKER ){
                _msg += ' (message bus on port ' + messageData[_forkable].messaging.port + ')';
            }

            console.log( ' + '+_msg );
        };

        // we expect to receive, not only the startup messages of the server(s) we start ourselves, 
        //  but also the forwarded startup messages from server(s) started by the formers
        //  (knowing that we manage only a one-level hierarchy)
        let _ipcCount = 0;
        let _ipcTarget = coreController.startupComputeTargetsCount( _sceConfig );

        const _ipcOnMessage = function( child, messageData ){
            //console.log( '_ipcOnMessage called', messageData.name, Object.keys( messageData )[0], messageData.event );
            _ipcToConsole( serviceName, messageData );
            coreForkable.startupOnIPCMessage( child, messageData );
            //console.log( 'about to increment ipcCount to', 1+_ipcCount );
            _ipcCount += 1;
        };

        //
        // used promises
        //                                  +-> _timeoutPromise  -+
        //  _checkPromise -> _startPromise -+-> _targetPromise  --+-> _checkPromise -> returnedPromise
        //

        // coreForkable.checkServiceWithJson() promise resolves as { reasons, startable, pids, ports, status }
        //  we are only interested here to the 'startable' attribute which is only true if the JSON runfile is empty or not present
        const _checkPromise = function( res, name, expected ){
            if( res === true || res.startable === true ){
                return new Promise(( resolve, reject ) => {
                    coreForkable.checkServiceByName( name, false )
                        .then(( _local ) => {
                            if( expected ){
                                if( _local.reasons.length === 0 ){
                                    console.log( chalk.green( 'Service(s) \''+serviceName+'\' successfully started.' ));
                                }
                            } else {
                                if( _local.reasons.length === 0 ){
                                    console.log( chalk.green( 'Service \''+serviceName+'\' is already running (fine). Gracefully exiting.' ));
                                } else if( !_local.startable ){
                                    console.log( chalk.yellow( 'Service is said running, but exhibits', _local.reasons.length,'error(s), is not startable' ));
                                    _local.reasons.every(( m ) => {
                                        console.log( chalk.yellow( ' '+m ));
                                        return true;
                                    })
                                } else {
                                    console.log( 'Service is not already running, is startable (fine)' );
                                }
                            }
                            resolve( _local );
                        });
                })
            } else {
                return Promise.resolve( res );
            }
        };

        // res here is the result of checkPromise(), ie the result of coreForkable.checkServiceByName()
        //  this same result is propagated
        const _startPromise = function( res, name ){
            if( res.startable ){
                return new Promise(( resolve, reject ) => {
                    // fork our coreController
                    console.log( ' - (main) requesting for coreController to start...' );
                    coreForkable.startupFork( Iztiar.c.forkable.CONTROLLER, _ipcOnMessage );
                    resolve( res );
                });
            } else {
                return Promise.resolve( res );
            }
        };

        // timeout promise
        //  say we count 1000ms per server to fork and start
        //  will eventually resolve with a {string} reason
        const _timeoutPromise = function( res ){
            if( res.startable ){
                return new Promise(( resolve, reject ) => {
                    const timeout_ms = 1000*_ipcTarget;
                    const timeoutId = setTimeout(() => {
                        clearTimeout( timeoutId );
                        //console.log( 'timeout reached, rejecting with reason', timeout_ms );
                        resolve( 'timeout ('+timeout_ms+'ms)' );
                    }, timeout_ms )
                });
            } else {
                return Promise.resolve( res );
            }
       }

        // target promise
        //  will eventually resolve with a {number} ipcTarget success value
        const _targetPromise = function( res ){
            if( res.startable ){
                return new Promise(( resolve, reject ) => {
                    const intervalId = setInterval(() => {
                        if( _ipcCount === _ipcTarget ){
                            clearInterval( intervalId );
                            //console.log( 'ipcCount has reached ipcTarget, resolving with value', _ipcTarget );
                            resolve( res );
                        }
                    }, 10 );
                });
            } else {
                return Promise.resolve( res );
            }
        };

        const _resultPromise = function( res ){
            return new Promise(( resolve, reject ) => {
                //console.log( res );
                if( res.reasons.length ){
                    Iztiar.exitCode( 1+Iztiar.exitCode());
                }
                resolve( true );
            });
        };

        let _promise = Promise.resolve( true )
            .then(( res ) => { return _checkPromise( res, serviceName, false )})
            .then(( res ) => { return _startPromise( res, serviceName )})
            .then(( res ) => { return Promise.race([ _timeoutPromise( res ), _targetPromise( res )])})
            .then(( res ) => { return _checkPromise( res, serviceName, true )})
            .then(( res ) => { return _resultPromise( res, serviceName )});

        return _promise;

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
