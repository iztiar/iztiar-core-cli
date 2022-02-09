/*
 * cli-stop.js
 *
 * Stop the named controller and its attached broker/controller(s).
 * 
 * Options managed here:
 *  - forceStop     whether to force the operation, defaulting to false
 * 
 * See also:
 *  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
 *  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises
 *  - https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises
 *  - https://www.tivix.com/blog/making-promises-in-a-synchronous-manner
 */
import chalk from 'chalk';
import ps from 'ps';

import { Iztiar, coreCmdline, coreError, coreForkable, coreLogger, coreRunfile, utils } from './imports.js';

export function cliStop( serviceName, options={} ){

    coreLogger.debug( 'cliStop()', 'serviceName='+serviceName, 'options', options );
    console.log( 'Trying to stop \''+serviceName+'\' service(s)' );
    const timeout_ms = 1000;
    const forceStop = Object.keys( options ).includes( 'forceStop' ) ? options.forceStop : coreCmdline.options().forceStop;
    coreLogger.debug( 'cliStop()', 'forceStop='+forceStop );

    if( serviceName === 'ALL' ){
        console.log( chalk.red( coreError.e.NAME_ALL_INVALID ));
        Iztiar.exitCode( 1+Iztiar.exitCode());
        return Promise.resolve( false );
    }

    // coreForkable.checkServiceByName() promise resolves as { reasons, startable, pids, ports, status }
    const _checkPromise = function( res, name, expected ){
        if( res === true || res.stoppable === true ){
            return new Promise(( resolve, reject ) => {
                //console.log( 'checking status' );
                coreLogger.debug( 'cliStop().checkPromise() about to coreForkable.checkServiceByName()', 'name='+name );
                coreForkable.checkServiceByName( name, false )
                    .then(( _local ) => {
                        //console.log( '_checkPromise() _local', _local );
                        _local.stoppable = true;
                        if( expected ){
                            if( _local.startable ){
                                console.log( chalk.green( 'Service \''+serviceName+'\' is not running. Gracefully exiting.' ));
                                _local.stoppable = false;
                            } else if( _local.reasons.length ){
                                console.log( chalk.yellow( 'Service is said running, but exhibits', _local.reasons.length,'error message(s)' ));
                            } else {
                                console.log( 'Service is up and running (which is what was expected)' );
                            }
                        } else {
                            if( _local.startable ){
                                console.log( chalk.green( 'Service(s) \''+serviceName+'\' successfully stopped.' ));
                            } else {
                                let _msg = 'Service is still said running';
                                if( !forceStop ){
                                    _msg += '; maybe you could give a try to the --force-stop option';
                                }
                                console.log( chalk.yellow( _msg ));
                                coreLogger.info( 'cliStop().checkPromise()', 'expected='+expected, _local );
                            }
                        }
                        resolve( _local );
                    });
            });
        } else {
            return Promise.resolve( res );
        }
    };

    // progagates the result received from checkServiceByName(), adding the count of requested servers
    const _stopController = function( res, name ){
        if( res.stoppable ){
            return new Promise(( resolve, reject ) => {
                const json = coreRunfile.jsonByName( name ) || {};
                const controller = json[Iztiar.c.forkable.CONTROLLER] || {};
                if( !controller || !Object.keys( controller ).length ){
                    console.log( chalk.yellow( '(main) coreController is not addressed in the run file' ));
                } else {
                    const port = controller.port || 0;
                    res.requested = 0;
                    if( port ){
                        res.requested += 1;
                        console.log( '(main) requesting coreController on port '+port+' to stop...');
                        utils.tcpRequest( port, 'iz.stop' )
                            .then(( _local ) => {
                                res.servers = _local.servers;
                                res.servers.every(( s ) => {
                                    res.requested += 1;
                                    console.log( '(coreController) requesting '+s.name+' on port '+s.port+' to stop...' );
                                    return true;
                                });
                            }, ( failure ) => {
                                console.log( chalk.red( '(coreController)', failure ));
                            })
                            .catch(( e ) => { coreLogger.error( 'cliStop().stopController()', e.name, e.message )});
                    } else {
                        console.log( chalk.yellow( '(main) unable to request a graceful stop to the coreController as its port is not present' ));
                        const pid = controller.pid || 0;
                        if( pid ){
                            console.log( '(main) trying to terminate the coreController process with pid '+pid+'...' );
                            process.kill( pid, 'SIGTERM' );
                        } else {
                            console.log( chalk.yellow( '(main) unable to terminate the coreController as its pid is not present' ));
                        }
                    }
                }
                resolve( res );
            })
        } else {
            return Promise.resolve( res );
        }
    }

    // progagates the result received from checkServiceByName()
    //  try to directly stop the broker if controller was not present and there is a broker
    const _stopBroker = function( res, name ){
        if( res.stoppable ){
            return new Promise(( resolve, reject ) => {
                const json = coreRunfile.jsonByName( name ) || {};
                const controller = json[Iztiar.c.forkable.CONTROLLER] || {};
                if( !controller || !Object.keys( controller ).length ){
                    const broker = json[Iztiar.c.forkable.BROKER] || {};
                    if( broker && Object.keys( broker ).length ){
                        const port = broker.port || 0;
                        if( port ){
                            console.log( '(main) directly requesting coreBroker on port '+port+' to stop...');
                            utils.tcpRequest( port, 'iz.stop' )
                                .then(( _local ) => { console.log( '(coreBroker)', _local );
                                }, ( failure ) => {
                                    console.log( chalk.red( '(coreBroker)', failure ));
                                })
                                .catch(( e ) => { coreLogger.error( 'cliStop().stopBroker()', e.name, e.message )});
                        } else {
                            console.log( chalk.yellow( '(main) unable to request a graceful stop to the coreBroker as its port is not present' ));
                            const pid = broker.pid || 0;
                            if( pid ){
                                console.log( '(main) trying to terminate the coreBroker process with pid '+pid+'...' );
                                process.kill( pid, 'SIGTERM' );
                            } else {
                                console.log( chalk.yellow( '(main) unable to terminate the coreBroker as its pid is not present' ));
                            }
                        }
                    }
                }
                resolve( res );
            })
        } else {
            return Promise.resolve( res );
        }
    }

    // returns a Promise which resolves with the list of processes among those provided which are still present
    const _countProcesses = function ( pids ){
        return new Promise(( resolve, reject ) => {
            //coreLogger.debug( 'cliStop().countProcesses() pids=', pids );
            if( pids.length ){
                ps({ pid: pids })
                    .then(( success ) => {
                        //coreLogger.debug( 'cliStop().countProcesses() resolves with', success );
                        resolve( success );
                    }, ( failure ) => {
                        //coreLogger.debug( 'cliStop().countProcesses() failure', failure );
                        resolve( [] );
                    })
                    .catch(( e ) => {
                        coreLogger.error( 'cliStop().countProcesses()', e.name, e.message );
                        resolve( [] );
                    });
            }
        });
    }

    // a wait_for_condition promise
    //  waiting here for count of processes (among those provided) be zero
    //  resolves to true when reached, to false on timeout
    let _waitAllowed = false;

   // resolves to true when there is no more process alive
    const _waitForZero = function( res ){
        if( _waitAllowed ){
            return new Promise(( resolve, reject ) => {
                const intervalId = setInterval(() => {
                    _countProcesses( res.pids )
                        .then(( _list ) => {
                            coreLogger.debug( 'cliStop()._countProcesses() resolves with', _list );
                            if( !_list.length ){
                                clearInterval( intervalId );
                                res.count = 0;
                                res.pids = [];
                                resolve( true );
                            }
                            if( !_waitAllowed ){
                                clearInterval( intervalId );
                                resolve( false );
                            }
                        });
                }, 10 );
            });
        } else {
            return Promise.resolve( res );
        }
    }

    // the goal is this promise to be resolved when count of pids is zero
    //  or rejected when timeout is expired
    const _waitFor = function( res, timeout ){
        if( res.stoppable ){
            _waitAllowed = true;
            return new Promise(( resolve, reject ) => {
                utils.waitFor( _waitForZero( res ), timeout )
                .then(( _ret ) => {
                    coreLogger.debug( 'cliStop()._waitFor() success', _ret );
                    _waitAllowed = false;
                    resolve( res );
                })
                .catch(( e ) => {
                    coreLogger.error( 'cliStop()._waitFor().catch()', e.name, e.message );
                    _waitAllowed = false;
                    resolve( res );
                });
            });
        } else {
            return Promise.resolve( res );
        }
    }

    // we receive the result of the second call to coreForkable.checkServiceByName()
    const _forceStop = function( res, name ){
        if( res.stoppable && forceStop && !res.startable ){
            return new Promise(( resolve, reject ) => {
                console.log( 'forceStop=true, make sure of cleaning the environment')
                res.pids.every(( p ) => {
                    console.log( chalk.yellow( '(main) trying to kill left process with pid '+p+'...' ));
                    process.kill( p, 'SIGKILL' );
                    return true;
                });
                console.log( chalk.yellow( '(main) unlinking the runfile...' ));
                coreRunfile.unlink( name );
                _checkPromise( res, name, false )
                    .then(( _local ) => {
                        _local.forcedStop = true;
                        resolve( _local );
                    });
            });
        } else {
            return Promise.resolve( res );
        }
    };

    const _resultPromise = function( res, name ){
        return new Promise(( resolve, reject ) => {
            //console.log( 'resultPromise()', res );
            if( !res.startable ){
                Iztiar.exitCode( 1+Iztiar.exitCode());
            }
            coreLogger.debug( 'cliStop().resultPromise()', 'exitCode='+Iztiar.exitCode(), res, );
            resolve( res );
        });
    };

    let _promise = Promise.resolve( true )
        .then(( res ) => { return _checkPromise( res, serviceName, true )})
        .then(( res ) => { return _stopController( res, serviceName )})
        .then(( res ) => { return _stopBroker( res, serviceName )})
        .then(( res ) => { return _waitFor( res, timeout_ms )})
        .then(( res ) => { return _checkPromise( res, serviceName, false )})
        .then(( res ) => { return _forceStop( res, serviceName )})
        .then(( res ) => { return _resultPromise( res, serviceName )});

    return _promise;
}
