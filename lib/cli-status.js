/*
 * cli-status.js
 *
 * Display the status of running controller(s) and their attached brokers
 * 
 * Scan the runDir directory for pid files which qualify the running controllers
 *  and ask them their status
 * 
 * Note:
 *  We do want a sequential display on the console!
 *  But some of our checks our asynchonous, and resolve as Promises.
 *  In order to be sure that a title will be displayed just before the result of the corresponding checks,
 *  but after the previous checks, we have to use only Promises, maybe automatically resolved, but at
 *  least .then() chained.
 */
import chalk from 'chalk';

import { Iztiar, coreError, coreLogger, coreRunfile, utils } from './imports.js';

export function cliStatus( serviceName ){

    console.log( 'Requiring services status' );

    // first push identified services just to be able to display the count
    //  scanDir() returns array of { name, json }
    console.log( 'Scanning run folder for active services...' );
    let services = [];
    coreRunfile.scanDir().every(( o ) => {
        console.log( ' > found \''+o.name+'\'' );
        services.push( o );
        return true;
    });

    let _totalCount = services.length;
    let _okCount = 0;
    let _errorCount = 0;

    if( _totalCount == 0 ){
        console.log( chalk.blue( '   no service is running' ));
    } else if( _totalCount == 1 ){
        console.log( chalk.blue( '   one service says it is running' ));
    } else {
        console.log( chalk.blue( '   ', services.length, 'services say they are running' ));
    }

    // a local to the function, but pseudo global variables inside of cliStatus()
    //  just to manage the results of all the promises
    let results = {};

    // returns the processes object or an error message from the json runfile content
    const _checkProcesses = function( json ){
        let _processes = null;
        try {
            _processes = coreRunfile.processesFromJson( json );
        } catch( e ){
            switch( e.message ){
                case coreError.e.RUNFILE_EMPTYCONTENT:
                    return 'empty content';
                case coreError.e.RUNFILE_NAMEUNSET:
                    return 'missing name';
                case coreError.e.RUNFILE_PIDUNSET:
                    return 'missing pid';
                case coreError.e.RUNFILE_PORTUNSET:
                    return 'missing port';
                default:
                    return e.message;
            }
        }
        return _processes;
    }

    const _messagePromise = function(){
        console.log( ...arguments );
        return Promise.resolve( true );
    }

    const _errorPromise = function( name, message ){
        console.log( chalk.red( message ));
        return Promise.resolve( true );
    }

    const _pidPromise = function( name, pid ){
        if( results[name].run ){
            return new Promise(( resolve, reject ) => {
                utils.isAlivePid( pid )
                    .then(( res ) => {
                        if( res ){
                            const _result = { user:res[0].user, time:res[0].time, elapsed:res[0].elapsed };
                            console.log( '      pid='+pid+' is alive', _result );
                            results[name].pid = res;
                            resolve( res );
                        } else {
                            console.log( chalk.red( '      pid='+pid+' is dead' ));
                            results[name].errs += 1;
                            resolve( false );
                        }
                    })
                    .catch(( e ) => {
                        coreLogger.error( e.name, e.message );
                        results[name].errs += 1;
                        resolve( false );
                    });
            });
        } else {
            return Promise.resolve( false );
        }
    }

    const _portPromise = function( name, port ){
        if( results[name].pid ){
            return new Promise(( resolve, reject ) => {
                utils.isAlivePort( port )
                    .then(( res ) => {
                        if( res ){
                            console.log( '      port='+port+' answers', res );
                            results[name].port = res;
                            resolve( res );
                        } else {
                            console.log( chalk.red( '      port='+port+' doesn\'t answer' ));
                            results[name].errs += 1;
                            resolve( false );
                        }
                    })
                    .catch(( e ) => {
                        coreLogger.error( e.name, e.message );
                        results[name].errs += 1;
                        resolve( false );
                    });
            });
        } else {
            return Promise.resolve( false );
        }
    }

    const _statusPromise = function( name, port ){
        if( results[name].port ){
            return new Promise(( resolve, reject ) => {
                utils.tcpRequest( port, 'iz.status' )
                    .then(( res ) => {
                        if( res ){
                            const _child = Object.keys( res )[0];
                            const _result = { forkable:_child, status: res[_child].status, manager:res[_child].manager };
                            console.log( '      statusOf answers', _result );
                            results[name].status = res;
                            resolve( res );
                        } else {
                            console.log( chalk.red( '      statusOf rejected' ));
                            results[name].errs += 1;
                            resolve( false );
                        }
                    })
                    .catch(( e ) => {
                        coreLogger.error( e.name, e.message );
                        results[name].errs += 1;
                        resolve( false );
                    });
            });
        } else {
            return Promise.resolve( false );
        }
    }

    const _serviceStatusPromise = function( name ){
        if( results[name].errs ){
            console.log( chalk.yellow( '   You may want use --clean option to remove the falsy \''+name+'\' from your run directory' ));
            Iztiar.exitCode( 1+Iztiar.exitCode());
        } else {
            console.log( chalk.green( '   Service \''+name+'\' is confirmed up and running' ));
        }
        return Promise.resolve( true );
    }

    const _globalResultPromise = function(){
        return new Promise(( resolve, reject ) => {
            console.log( results );
            resolve( true );
        });
    }

    // and now request the services
    //  detailing here the error cause
    let _promise = Promise.resolve( true );

    services.every(( o ) => {
        //console.log( 'service', o );
        _promise = _promise.then( res => { return _messagePromise( 'Examining \''+o.name+'\' service' )});

        const _processes = _checkProcesses( o.json );
        results[o.name] = { run:false, pid:null, port:null, status:null, errs:0 };

        if( typeof _processes === 'string' ){
            results[o.name].errs += 1;
            _promise = _promise.then( res => { return _errorPromise( o.name, '   invalid runfile ('+_processes+')' )});

        } else {
            results[o.name].run = true;
            for( const _forkable in _processes ){
                //console.log( '   '+ _forkable, _processes[_forkable] );
                _promise = _promise.then( res => { return _messagePromise( '   '+ _forkable, _processes[_forkable] )});
                //console.log( 'pushing pid', o.name, _processes[_forkable].pid );
                _promise = _promise.then( res => { return _pidPromise( o.name, _processes[_forkable].pid )});
                //console.log( 'pushing port', o.name, _processes[_forkable].port );
                _promise = _promise.then( res => { return _portPromise( o.name, _processes[_forkable].port )});
                //console.log( 'pushing status', o.name, _processes[_forkable].port );
                _promise = _promise.then( res => { return _statusPromise( o.name, _processes[_forkable].port )});
            }
        }
        _promise = _promise.then( res => { return _serviceStatusPromise( o.name )});
        return true;
    });

    _promise = _promise.then( res => { return _globalResultPromise()});

        /*
        _forkable = Iztiar.c.forkable.CONTROLLER;
        _port = o.processes[_forkable].port;
        console.log( '   requesting coreController on port '+_port+'...');
        coreForkable.statusOf( _port, ( e, res ) => {
            if( e ){
                console.log( '   coreController doesn\'t answer!' );
            } else {
               coreLogger.info( 'received from coreController', res );
               _forked = Object.keys( res )[0];
               _listening = res[_forked].port;
               //console.log( 'res', res );
               //console.log( '_forked', _forked );
               console.log( ' + coreController:'+_listening+' answers:');
               console.log( '      myself as coreController' );
               console.log( '         name          : '+res[_forked].config.controller.name );
               console.log( '         listening port: '+_listening );
               console.log( '         status:       : '+res[_forked].status );
               console.log( '         broker enabled: '+res[_forked].config.broker.enabled );
               console.log( '         run           : '+res[_forked].run );
               console.log( '         storageDir    : '+res[_forked].storageDir );
               console.log( '         version       : '+res[_forked].version );
               console.log( '      log' );
               console.log( '         file          : '+res[_forked].logfile );
               console.log( '         level         : '+res[_forked].config.logLevel.toLowerCase());
               console.log( '      process' );
               console.log( '         pid           : '+res[_forked].pid );
               console.log( '         cpu           : '+res[_forked].pidUsage.cpu );
               console.log( '         memory        : '+res[_forked].pidUsage.memory );
               console.log( '         ctime         : '+res[_forked].pidUsage.ctime );
               console.log( '         elapsed       : '+res[_forked].pidUsage.elapsed );
               console.log( '      environment' );
               console.log( '         IZTIAR_DEBUG  : '+res[_forked].environment.IZTIAR_DEBUG );
               console.log( '         IZTIAR_ENV    : '+res[_forked].environment.IZTIAR_ENV );
               console.log( '         NODE_ENV      : '+res[_forked].environment.NODE_ENV );
            }
        });

        _forkable = Iztiar.c.forkable.BROKER;
        if( o[_forkable] ){
            _port = o.processes[_forkable].port;
            console.log( '   requesting coreBroker on port '+_port+'...');
            coreForkable.statusOf( _port, ( e, res ) => {
                //coreLogger.debug( 'coreBroker e', e );
                //coreLogger.debug( 'coreBroker res', res );
                if( e ){
                    console.log( '   coreBroker doesn\'t answer!' );
                } else {
                    coreLogger.info( 'received from coreBroker', res );
                   _forked = Object.keys( res )[0];
                   _listening = res[_forked].port;
                   //console.log( '_forked', _forked );
                   console.log( ' + coreBroker:'+_listening+' answers:');
                   console.log( '      myself as coreBroker' );
                   console.log( '         listening port: '+_listening );
                   console.log( '         messaging port: '+res[_forked].config.broker.messagingPort );
                   console.log( '      the coreController I am attached to' );
                   console.log( '         name          : '+res[_forked].config.controller.name );
                   console.log( '      log' );
                   console.log( '         file          : '+res[_forked].logfile );
                   console.log( '         level         : '+res[_forked].config.logLevel.toLowerCase());
                   console.log( '      process' );
                   console.log( '         pid           : '+res[_forked].pid );
                   console.log( '         cpu           : '+res[_forked].pidUsage.cpu );
                   console.log( '         memory        : '+res[_forked].pidUsage.memory );
                   console.log( '         ctime         : '+res[_forked].pidUsage.ctime );
                   console.log( '         elapsed       : '+res[_forked].pidUsage.elapsed );
                   console.log( '      environment' );
                   console.log( '         IZTIAR_DEBUG  : '+res[_forked].environment.IZTIAR_DEBUG );
                   console.log( '         IZTIAR_ENV    : '+res[_forked].environment.IZTIAR_ENV );
                   console.log( '         NODE_ENV      : '+res[_forked].environment.NODE_ENV );
                }
            });
        }
        */

    //console.log( _promise );
    return _promise;
}
