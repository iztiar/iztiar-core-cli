/*
 * cli-start.js

 * Starts a controller
 * If not prevented against, the controller will then startup its message bus broker.
 * From the main CLI process point of view, we only have to manage the coreController.
 * 
 * Options managed here:
 *  - args      the command-line arguments to consider when forking, defaulting to process.argv
 */
import chalk from 'chalk';

import { Iztiar, coreBroker, coreConfig, coreController, coreError, coreForkable, msg } from './imports.js';

export function cliStart( serviceName, options={} ){

    const _processName = Iztiar.envForked();
    const _sceConfig = coreConfig.getControllerFilledConfig( serviceName );
    msg.debug( 'cliStart()', 'processName='+_processName, 'serviceName='+serviceName, 'options', options, 'sceConfig=', _sceConfig );
    const _args = Object.keys( options ).includes( 'args' ) ? options.args : process.argv;

    if( serviceName === 'ALL' ){
        msg.error( coreError.e.NAME_ALL_INVALID );
        process.exitCode += 1;
        return Promise.resolve( false );
    }

    // main CLI process
    //  fork a coreController if nothing prevent that
    //  we have next to wait for coreController IPC startup message
    if( !_processName ){
        msg.out( 'Trying to start \''+serviceName+'\' service(s)...' );

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

            msg.out( ' + '+_msg );
        };

        // we expect to receive, not only the startup messages of the server(s) we start ourselves, 
        //  but also the forwarded startup messages from server(s) started by the formers
        //  (knowing that we manage only a one-level hierarchy)
        let _ipcCount = 0;
        let _ipcTarget = coreController.startupComputeTargetsCount( serviceName, _sceConfig );
        msg.debug( 'cliStart().ipcTarget='+_ipcTarget );

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

        // coreForkable.checkServiceByName() promise resolves as { reasons, startable, pids, ports, status }
        //  we are only interested here to the 'startable' attribute which is only true if the JSON runfile is empty or not present
        const _checkPromise = function( res, name, expected ){
            //console.log( '_checkPromise() expected='+expected );
            if( res === true || res.startable === true ){
                return new Promise(( resolve, reject ) => {
                    coreForkable.checkServiceByName( name, false )
                        .then(( _local ) => {
                            if( expected ){
                                if( _local.reasons.length === 0 ){
                                    msg.out( chalk.green( 'Service(s) \''+serviceName+'\' successfully started.' ));
                                }
                            } else {
                                if( _local.reasons.length === 0 ){
                                    msg.out( chalk.green( 'Service \''+serviceName+'\' is already running (fine). Gracefully exiting.' ));
                                } else if( !_local.startable ){
                                    msg.warn( 'Service is said running, but exhibits', _local.reasons.length,'error message(s), is not startable' );
                                    _local.reasons.every(( m ) => {
                                        msg.warn( ' '+m );
                                        return true;
                                    })
                                } else {
                                    msg.out( 'Service is not already running, is startable (fine)' );
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
                    msg.out( ' - (main) requesting for '+serviceName+' coreController to start...' );
                    coreForkable.startupFork( Iztiar.c.forkable.CONTROLLER, _ipcOnMessage, _args );
                    resolve( res );
                });
            } else {
                return Promise.resolve( res );
            }
        };

        // a boolean function to be used in _waitFor() promise
        const _testTarget = function(){
            //msg.debug( 'cliStart().testTarget returns '+( _ipcCount === _ipcTarget ));
            return _ipcCount === _ipcTarget;
        };

        // a promise which encapsulates the race between a timeout and a condition to be waited for
        //  resolves to provided 'res' in order it is propagated
        const _waitFor = function( res, boolFn, parmsFn, timeout ){
            msg.debug( 'cliStart()._waitFor() timeout='+timeout );
            let _end = Date.now()+timeout;
            return new Promise(( resolve, reject ) => {

                const _resolve = function( id, value, _msg ){
                    clearInterval( id );
                    msg.debug( 'cliStart()._waitFor() '+_msg );
                    res.waitFor = value;
                    resolve( res );
                };

                const _id = setInterval(() => {
                    if( boolFn( parmsFn )){
                        _resolve( _id, true, 'condition is met' );
                    }
                    if( Date.now() > _end ){
                        msg.debug( 'cliStart()._waitFor() ' );
                        _resolve( _id, false, 'timeout is reached' );
                    }
                }, 10 );
            });
        };

        const _resultPromise = function( res ){
            return new Promise(( resolve, reject ) => {
                //console.log( 'cliStart().resultPromise().res', res );
                if( res.reasons.length ){
                    process.exitCode += 1;
                }
                resolve( res );
            });
        };

        let _promise = Promise.resolve( true )
            .then(( res ) => { return _checkPromise( res, serviceName, false )})
            .then(( res ) => { return _startPromise( res, serviceName )})
            .then(( res ) => { return _waitFor( res, _testTarget, {}, 500*_ipcTarget )})
            .then(( res ) => { return _checkPromise( res, serviceName, true )})
            .then(( res ) => { return _resultPromise( res, serviceName )});

        return _promise;

    // coreController forked process
    //  have to actually start the controller
    //  have also to fork managed controllers and message broker
    } else if( _processName === Iztiar.c.forkable.CONTROLLER ){
        const controller = new coreController( serviceName, coreConfig.getAppFilledConfig(), _sceConfig );
        controller.startupStart();

    // coreBroker forked process
    //  start the messaging subservers
    } else if( _processName === Iztiar.c.forkable.BROKER ){
        const broker = new coreBroker( serviceName, coreConfig.getAppFilledConfig(), _sceConfig );
        broker.startupStart();
    }

    return new Promise(() => {});   // never resolves
}
