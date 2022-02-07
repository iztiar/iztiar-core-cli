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

    console.log( 'Stopping \''+serviceName+'\' service(s)' );
    
    const run = coreRunfile.jsonByName( serviceName );
    const controller = coreRunfile.getTopController( run );
    const port = controller.listening || 0;
    const pidList = coreRunfile.getPidList( run );
    const timeout_ms = 1000;

    // resolves with the count of processes among those provided
    const countProcesses = function ( pids ){
        return new Promise(( resolve, reject ) => {
            //console.log( 'calling ps pids=', pids );
            ps({ pid: pids })
                .then(( res ) => {
                    //console.log( 'count='+res.length );
                    resolve( res.length );
                })
                .catch(( e ) => { coreLogger.error( 'countProcesses()', e.name, e.message )});
        })
    }

    // resolves with the count of processes which we have requested to stop
    const stopServers = function(){
        return new Promise(( resolve, reject ) => {
            let requested = 0;
            if( port ){
                requested += 1;
                console.log( ' - (main) requesting coreController on port '+port+' to stop...');
                utils.tcpRequest( port, 'iz.stop' )
                    .then(( res ) => {
                        const _servers = res.servers;
                        _servers.every(( s ) => {
                            requested += 1;
                            console.log( ' - (coreController) requesting '+s.name+' on port '+s.port+' to stop...' );
                            return true;
                        })
                        resolve( requested );
                    })
                    ;//.catch(( e ) => { coreLogger.error( 'stopServers()', e.name, e.message )});
            } else {
                console.log( chalk.yellow( ' ! Service is not running at the moment' ));
                reject( 'no-service' );
            }
        })
    }

    // this is a single iteration of waitFor(): queue the countProcesses() promise, and waits for its result
    //  resolve when we get zero alive process, reject else
    //  throws error else
    const waitForZero = function( pids){
        return new Promise(( resolve, reject ) => {
            countProcesses( pids )
                .then(( res ) => {
                    //console.log( 'waitForZero.countProcesses() count='+res );
                    if( res ){
                        reject( res );
                    } else {
                        resolve( 'waitForZero() count=0 => resolving' );
                    }
                })
        });
    }

    // the goal is this promise to be resolved when count of pids is zero
    //  or rejected when timeout is expired
    const waitFor = function( pids, until_ms ){
        return new Promise(( resolve, reject ) => {
            //const _success = function(){
                function _success( result ){
                    //console.log( 'waitFor()', result );
                    resolve( result );
                }
                const _failure = function(){
                    if( Date.now() < until_ms ){
                        //console.log( 'recurse' );
                        waitForZero( pids ).then( _success, _failure );
                    } else {
                        console.log( 'reject timeout' );
                        reject( 'timeout' );
                    }
                }
                waitForZero( pids ).then( _success, _failure );
            });
    }

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
}
