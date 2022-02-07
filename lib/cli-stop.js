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
 */
import chalk from 'chalk';
import ps from 'ps';

import { Iztiar, coreConfig, coreError, coreForkable, coreLogger, coreRunfile, utils } from './imports.js';

export function cliStop( serviceName ){

    console.log( 'Trying to stop \''+serviceName+'\' service(s)' );
    const timeout_ms = 1000;

    // coreForkable.checkServiceWithJson() promise resolves as { errs, status, startable, pids }
    const _checkPromise = function( res, name, expected ){
        if( res === true || res.errs === 0 ){
            return new Promise(( resolve, reject ) => {
                coreForkable.checkServiceByName( name, false )
                    .then(( _local ) => {
                        console.log( '_local', _local );
                        if( expected ){
                            if( _local.startable ){
                                console.log( chalk.yellow( 'Service(s) \''+serviceName+'\' is not running.' ));
                                Iztiar.exitCode( 1+Iztiar.exitCode());
                            } else if( _local.errs ){
                                console.log( chalk.yellow( 'Service is said running, but exhibits', _local.errs,'error(s)' ));
                            } else {
                                console.log( 'Service is up and running (fine)' );
                            }
                        } else {
                            if( _local.startable ){
                                console.log( chalk.green( 'Service(s) \''+serviceName+'\' successfully stopped.' ));
                            } else {
                                console.log( 'Service is still said running; maybe you could give a try to the --force-stop option' );
                            }
                        }
                        resolve( _local );
                    });
            })
        } else {
            return Promise.resolve( res );
        }
    };

    // resolves with the count of processes which we have requested to stop
    const _stopControllers = function( res, name ){
        if( !res.errs ){
            return new Promise(( resolve, reject ) => {
                const json = coreRunfile.jsonByName( name ) || {};
                const controller = json[Iztiar.c.forkable.CONTROLLER] || {};
                const port = controller.port || 0;
                if( port ){
                    requested += 1;
                    console.log( ' - (main) requesting coreController on port '+port+' to stop...');
                    utils.tcpRequest( port, 'iz.stop' )
                        .then(( _local ) => {
                            const _servers = res.servers;
                            _servers.every(( s ) => {
                                requested += 1;
                                console.log( ' - (coreController) requesting '+s.name+' on port '+s.port+' to stop...' );
                                return true;
                            })
                        })
                        ;//.catch(( e ) => { coreLogger.error( 'stopServers()', e.name, e.message )});
                } else {
                    console.log( chalk.yellow( '   coreController not found' ));
                    res.errs += 1;
                }
                resolve( res );
            })
        } else {
            return Promise.resolve( res );
        }
    }

    // resolves with the count of processes among those provided
    const _countProcesses = function ( pids ){
        return new Promise(( resolve, reject ) => {
            //console.log( 'calling ps pids=', pids );
            ps({ pid: pids })
                .then(( _local ) => {
                    //console.log( 'count='+res.length );
                    resolve( _local.length );
                })
                .catch(( e ) => { coreLogger.error( '_countProcesses()', e.name, e.message )});
        })
    }

    // this is a single iteration of waitFor(): queue the _countProcesses() promise, and waits for its result
    //  resolve when we get zero alive process, reject else
    //  throws error else
    const _waitForZero = function( res ){
        if( !res.errs ){
            return new Promise(( resolve, reject ) => {
                _countProcesses( res.pids )
                    .then(( _count ) => {
                        res.count = _count;
                        resolve( res );
                    });
            });
        } else {
            return Promise.resolve( res );
        }
    }

    // the goal is this promise to be resolved when count of pids is zero
    //  or rejected when timeout is expired
    const _waitFor = function( res, until_ms ){
        if( !res.errs ){
            return new Promise(( resolve, reject ) => {
                //const _success = function(){
                    function _success( _local ){
                        if( _local.count === 0 ){
                            resolve( _local );
                        } else if( Date.now() < until_ms ){
                            //console.log( 'recurse' );
                            _waitForZero( pids ).then( _success );
                        } else {
                            console.log( 'reject timeout' );
                            res.errs += 1;
                            resolve( res );
                        }
                    }
                    _waitForZero( pids ).then( _success );
            });
        } else {
            return Promise.resolve( res );
        }
    }

    const _resultPromise = function( res, name ){
        return new Promise(( resolve, reject ) => {
            console.log( res );
        });
    };

    /*
    countProcesses( pidList )
        .then(( count ) => {
            //console.log( 'initial count =', count );
            return stopServers();
        })
        .then(( requested ) => {
            //console.log( 'waiting for processes count decrease...' );
            //console.log( requested, 'requested processes' );
            console.log( ' - waiting for processes termination...' );
            return waitFor( pidList, Date.now()+timeout_ms );
        })
        .then(( ended ) => {
            console.log( ' - done' );
            console.log( chalk.green( 'Service(s) \''+serviceName+'\' successfully stopped.' ));
        })
        .catch(( e ) => { coreLogger.error( e.name, e.message )});
        */

    let _promise = Promise.resolve( true )
        .then(( res ) => { return _checkPromise( res, serviceName, true )})
        .then(( res ) => { return _stopControllers( res, serviceName )})
        .then(( res ) => { return _waitFor( res, Date.now()+timeout_ms )})
        .then(( res ) => { return _checkPromise( res, serviceName, false )})
        .then(( res ) => { return _resultPromise( res, serviceName )});

    return _promise;
}
