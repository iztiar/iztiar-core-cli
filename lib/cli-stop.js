/*
 * cli-stop.js
 *
 * Stop the named controller and its attached broker/controller(s).
 * 
 * See also:
 *  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
 *  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises
 *  - https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises
 *  - https://www.tivix.com/blog/making-promises-in-a-synchronous-manner
 * 
 * Note:
 */
import chalk from 'chalk';
import ps from 'ps';

import { Iztiar, coreCmdline, coreForkable, coreLogger, coreRunfile, utils } from './imports.js';

export function cliStop( serviceName ){

    console.log( 'Trying to stop \''+serviceName+'\' service(s)' );
    const timeout_ms = 1000;
    const forceStop = coreCmdline.options().forceStop;
    //console.log( 'forceStop='+forceStop );

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
                                console.log( chalk.green( 'Service(s) \''+serviceName+'\' is not running. Gracefully exiting.' ));
                                _local.stoppable = false;
                            } else if( _local.reasons.length ){
                                console.log( chalk.yellow( 'Service is said running, but exhibits', _local.reasons.length,'error(s)' ));
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
                            console.log( '(main) requesting coreBroker on port '+port+' to stop...');
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

    // resolves with the list of processes among those provided which are still present
    const _countProcesses = function ( pids ){
        return new Promise(( resolve, reject ) => {
            //coreLogger.debug( 'cliStop().countProcesses() pids=', pids );
            if( pids.length ){
                ps({ pid: pids })
                    .then(( success ) => {
                        coreLogger.debug( 'cliStop().countProcesses() resolves with', success );
                        resolve( success );
                    }, ( failure ) => {
                        coreLogger.debug( 'cliStop().countProcesses() failure', failure );
                        resolve( [] );
                    })
                    .catch(( e ) => {
                        coreLogger.error( 'cliStop().countProcesses()', e.name, e.message );
                        resolve( [] );
                    });
            }
        });
    }

    // this is a single iteration of waitFor(): queue the _countProcesses() promise, and waits for its result
    //  resolve when we get zero alive process, reject else
    //  throws error else
    const _waitForZero = function( res ){
        return new Promise(( resolve, reject ) => {
            _countProcesses( res.pids )
                .then(( _list ) => {
                    //console.log( 'cliStop().waitForZero() receives=', _list );
                    let _local = { ...res };
                    _local.count = _list.length || 0;
                    _local.pids = _list;
                    coreLogger.debug( 'cliStop().waitForZero() resolves with', _local.pids );
                    resolve( _local );
                });
        });
    }

    // the goal is this promise to be resolved when count of pids is zero
    //  or rejected when timeout is expired
    const _waitFor = function( res, until_ms ){
        if( res.stoppable ){
            return new Promise(( resolve, reject ) => {
                function _success( _local ){
                    //console.log( 'waitFor.success.local', _local );
                    if( _local.count === 0 ){
                        resolve( _local );
                    } else if( Date.now() < until_ms ){
                        //console.log( 'recurse' );
                        _waitForZero( _local ).then( _success );
                    } else {
                        console.log( 'timeout ('+timeout_ms+'ms)' );
                        resolve( _local );
                    }
                }
                _waitForZero( res ).then( _success );
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
        .then(( res ) => { return _waitFor( res, Date.now()+timeout_ms )})
        .then(( res ) => { return _checkPromise( res, serviceName, false )})
        .then(( res ) => { return _forceStop( res, serviceName )})
        .then(( res ) => { return _resultPromise( res, serviceName )});

    return _promise;
}
