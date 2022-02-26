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
import net from 'net';
import ps from 'ps';

import { Iztiar, coreCmdline, coreConfig, coreError, coreForkable, coreRunfile, msg, utils } from './imports.js';

export function cliStop( serviceName, options={} ){

    msg.debug( 'cliStop()', 'serviceName='+serviceName, 'options', options );
    msg.out( 'Trying to stop \''+serviceName+'\' service(s)' );
    const timeout_ms = 1000;
    const forceStop = Object.keys( options ).includes( 'forceStop' ) ? options.forceStop : coreCmdline.options().forceStop;
    msg.debug( 'cliStop()', 'forceStop='+forceStop );

    if( serviceName === 'ALL' ){
        msg.err( coreError.e.NAME_ALL_INVALID );
        process.exitCode += 1;
        return Promise.resolve( false );
    }

    // the list of servers which have been requested to stop
    //  updated from stopController() and stopBroker() promises and from data received by the tcp server below
    //  plus an update function
    let hierarchy = { pids:[], servers:[] };
    const _serversAdd = function( o ){
        //console.log( 'serversAdd', o );
        hierarchy.servers.push( o );
        hierarchy.pids.push( o.pid );
        msg.out( ' + '+o.name+' '+o.forkable+' acknowledges the stop request (pid='+o.pid+', port='+o.port+')' );
    }

    // define a TCP server which will manage the answers received from the stopped services
    const tcpServer = net.createServer(( c ) => {
        c.on( 'data', ( data ) => {
            const _bufferStr = new Buffer.from( data ).toString()
            //console.log( 'cliStop().tcpServer.on(\'data\')', '_bufferStr='+_bufferStr );
            const _words = _bufferStr.split( ' ' );
            if( _words[0] === Iztiar.c.app.stop.command ){
                const _json = JSON.parse( _words[1] );
                _serversAdd( _json );
                c.write( JSON.stringify({ 'iz.ack': 'iz.ack' }));
                c.end();
            }
        })
        .on( 'error', ( e ) => {
            msg.error( 'cliStop().createServer.on(\'error\')', e.name, e.message );
        });
    });
    const tcpPort = coreConfig.getAppFilledConfig().stop.port;
    tcpServer.listen( tcpPort, '0.0.0.0', () => {
        msg.info( 'cliStop() TCP server listening on port '+tcpPort );
    });

    // coreForkable.checkServiceByName() promise resolves as { reasons, startable, pids, ports, status }
    const _checkPromise = function( res, name, expected ){
        if( res === true || res.stoppable === true ){
            return new Promise(( resolve, reject ) => {
                //console.log( 'checking status' );
                msg.debug( 'cliStop().checkPromise() about to coreForkable.checkServiceByName()', 'name='+name );
                coreForkable.checkServiceByName( name, false )
                    .then(( _local ) => {
                        //console.log( '_checkPromise() _local', _local );
                        _local.stoppable = true;
                        _local.controllerRequested = false;
                        _local.brokerRequested = false;
                        if( expected ){
                            if( _local.startable ){
                                msg.out( chalk.green( 'Service \''+name+'\' is not running. Gracefully exiting.' ));
                                _local.stoppable = false;
                            } else if( _local.reasons.length ){
                                msg.warn( 'Service is said running, but exhibits', _local.reasons.length,'error message(s)' );
                            } else {
                                msg.out( 'Service is up and running (which is what was expected)' );
                            }
                        } else {
                            if( _local.startable ){
                                msg.out( chalk.green( 'Service(s) \''+name+'\' successfully stopped.' ));
                            } else {
                                let _msg = 'Service is still said running';
                                if( !forceStop ){
                                    _msg += '; maybe you could give a try to the --force-stop option';
                                }
                                msg.warn( _msg );
                                msg.debug( 'cliStop().checkPromise()', 'expected='+expected, 'got', _local );
                            }
                        }
                        resolve( _local );
                    });
            });
        } else {
            return Promise.resolve( res );
        }
    };

    // progagates the result received from checkServiceByName(), adding the { name,forkable,pid,port } answered by the controller
    const _stopController = function( res, name ){
        //console.log( res );
        if( res.stoppable ){
            res.controllerRequested = true;
            return new Promise(( resolve, reject ) => {
                const controller = res.status[Iztiar.c.forkable.CONTROLLER] || {};
                if( !controller || !Object.keys( controller ).length ){
                    const _msg = '(main) coreController is not addressed in the run file';
                    msg.error( _msg );
                    res.reasons.push( _msg );
                    resolve( res );
                } else {
                    const port = controller.port || 0;
                    if( port ){
                        msg.out( ' - (main) requesting for '+name+' coreController on port '+port+' to stop...');
                        utils.tcpRequest( port, 'iz.stop '+tcpPort )
                            .then(( _local ) => {
                                //console.log( name+' coreController answers as', _local );
                                _serversAdd( _local );
                                resolve( res );
                            })
                            .catch(( e ) => {
                                msg.error( 'cliStop().stopController().catch()', e.name, e.message )
                                resolve( res );
                            });
                    } else {
                        msg.warn( '   (main) unable to request a graceful stop to the coreController as its port is not present' );
                        const pid = controller.pid || 0;
                        if( pid ){
                            msg.out( '   (main) trying to terminate the coreController process with pid '+pid+'...' );
                            process.kill( pid, 'SIGTERM' );
                        } else {
                            msg.warn( '   (main) unable to terminate the coreController as its pid is not present' );
                            res.controllerRequested = false;
                        }
                        resolve( res );
                    }
                }
            })
        } else {
            msg.debug( 'cliStop().stopController() skipped', 'res.stoppable='+res.stoppable );
            return Promise.resolve( res );
        }
    }

    // progagates the result received from checkServiceByName()
    //  try to directly stop the broker if controller was not present and there is a broker
    const _stopBroker = function( res, name ){
        if( res.stoppable && !res.controllerRequested ){
            res.brokerRequested = true;
            return new Promise(( resolve, reject ) => {
                const _resolver = function(){
                    msg.debug( 'cliStop().stopBroker() resolved with', 'res.controllerRequested='+res.controllerRequested, 'res.brokerRequested='+res.brokerRequested );
                    resolve( res );
                };
                const broker = res.status[Iztiar.c.forkable.BROKER] || {};
                if( broker && Object.keys( broker ).length ){
                    const port = broker.port || 0;
                    if( port ){
                        msg.out( ' - (main) directly requesting '+name+' coreBroker on port '+port+' to stop...');
                        utils.tcpRequest( port, 'iz.stop '+tcpPort )
                            .then(( _local ) => {
                                msg.debug( name+' coreBroker answers as', _local );
                                _serversAdd( _local );
                                _resolver();
                            }, ( failure ) => {
                                msg.error( ' + ('+name+' coreBroker) failure', failure );
                                resolve( res );
                            })
                            .catch(( e ) => {
                                msg.error( 'cliStop().stopBroker().catch()', e.name, e.message )
                                _resolver();
                            });
                    } else {
                        msg.warn( '   (main) unable to request a graceful stop to the coreBroker as its port is not present' );
                        const pid = broker.pid || 0;
                        if( pid ){
                            msg.out( '   (main) trying to terminate the coreBroker process with pid '+pid+'...' );
                            process.kill( pid, 'SIGTERM' );
                        } else {
                            msg.warn( '   (main) unable to terminate the coreBroker as its pid is not present' );
                            res.brokerRequested = false;
                        }
                        _resolver();
                    }
                } else {
                    msg.debug( 'cliStop().stopBroker() coreBroker not addressed in the runfile or empty' );
                    _resolver();
                }
            })
        } else {
            msg.debug( 'cliStop().stopBroker() skipped', 'res.stoppable='+res.stoppable, 'res.controllerRequested='+res.controllerRequested );
            return Promise.resolve( res );
        }
    }

    // returns a Promise which resolves to true when the provided pids list no more exist at all
    //  i.e. when ps returns zero process
    const _countProcesses = function ( pids ){
        msg.debug( 'cliStop().countProcesses() pids=', pids );
        return new Promise(( resolve, reject ) => {
            if( pids.length ){
                ps({ pid: pids })
                    .then(( success ) => {
                        msg.debug( 'cliStop().countProcesses() ps resolves with', success );
                        resolve( success.length === 0 );
                    }, ( failure ) => {
                        msg.debug( 'cliStop().countProcesses() ps failure', failure );
                        resolve( failure.length === 0 );
                    });
            } else {
                resolve( true );
            }
        });
    };

    // we receive the result of the second call to coreForkable.checkServiceByName()
    const _forceStop = function( res, name ){
        if( res.stoppable && forceStop && !res.startable ){
            return new Promise(( resolve, reject ) => {
                msg.out( 'forceStop=true, make sure of cleaning the environment')
                res.pids.every(( p ) => {
                    msg.out( chalk.yellow( '(main) trying to kill left process with pid '+p+'...' ));
                    process.kill( p, 'SIGKILL' );
                    return true;
                });
                msg.out( chalk.yellow( '(main) unlinking the runfile...' ));
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
                process.exitCode += 1;
            }
            msg.debug( 'cliStop().resultPromise()', 'exitCode='+process.exitCode, res, );
            resolve( res );
        });
    };

    let _promise = Promise.resolve( true )
        .then(( res ) => { return _checkPromise( res, serviceName, true )})
        .then(( res ) => { return _stopController( res, serviceName )})
        .then(( res ) => { return _stopBroker( res, serviceName )})
        .then(( res ) => { return utils.waitFor( res, _countProcesses, hierarchy.pids, timeout_ms )})
        .then(( res ) => { return _checkPromise( res, serviceName, false )})
        .then(( res ) => { return _forceStop( res, serviceName )})
        .then(( res ) => { return _resultPromise( res, serviceName )});

    return _promise;
}
