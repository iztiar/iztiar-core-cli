/*
 * coreForkable
 */
import cp from 'child_process';
import net from 'net';

import { Iztiar, coreLogger, coreResult, coreConfig, coreController, utils } from './imports.js';

    const err = {}
    /*
     * we receive a message via the IPC channel from our forked child process
     *  if this is the 'startup' event we are waiting for, 
     *  then take advantage of it for declaring the readyness of the child
     *  see advertiseParent() method below for the format of the received object
     * 
     * forker is the object which has been passed to fork() static function below.
     * It has been instanciated in cliStart().
     * 
     * (parent process)
     */
    function _onIPCMessage( child, forker, obj ){
        const keys = Object.keys( obj );
        const forkable = keys[0];
        if( obj[forkable].event === 'startup' && obj[forkable].status && obj[forkable].status.length ){
            coreLogger.info( forkable+' successfully started with pid '+obj[forkable].pid );
            // if something is waited for forked readyness, then we say ok
            forker.ready = true;

            // write the received startup message on the controller's json file
            //  there is one 'coreController' key, and maybe one 'coreBroker' key
            const _name = obj[forkable].config.controller.name;
            const _path = coreController.getJsonPath( _name );
            let _json = utils.jsonReadFileSync( _path ) || {};
            const _orig = { ..._json };
            _json = {
                ..._json,
                ...obj
            };
            utils.jsonWriteFileSync( _path, _json, _orig );

            // the process which has initialized this object may have requested to be called on startup
            //  it must have provided its 'parent' NodeJs Process
            if( forker.cbStartup && typeof forker.cbStartup === 'function' && forker.parent ){
                forker.cbStartup( forker.parent, obj );
            }

            // if an exit function has been provided, call it
            //coreLogger.debug( forker );
            if( forker.cbExit && typeof forker.cbExit === 'function' ){
                forker.cbExit( 0 );
            }
        }
    }

export class coreForkable {

    static c = {
        FORKABLE_BROKER: 'coreBroker',
        FORKABLE_CONTROLLER: 'coreController'
    };

    static e = {
        UNKNOWN_COMMAND: 'coreForkable::unknown-command'
    };

    static s = {
        STARTING: 'starting',
        RUNNING: 'running',
        STOPPING: 'stopping'
    };

    /**
     * fork this process
     *  actually re-running our same CLI command in a dedicated environment
     *  (parent process)
     */
    static fork( forker ){
        coreLogger.debug( 'coreForkable::fork() about to fork '+forker.type );
        const _path = process.argv[1];
        let _args = process.argv;
        _args.shift();
        _args.shift();
        let _env = {
            ...process.env
        };
        _env[Iztiar.c.forkable.uuid] = forker.type; // this says to the child that it has been forked
        let _options = {
            detached: true,
            env: _env
        };

        let child = cp.fork( _path, _args, _options );

        child.on( 'message', ( obj ) => {
            coreLogger.info( 'coreForkable::on.message %o', obj );
            _onIPCMessage( child, forker, obj );
        });

        return child;
    }

    /**
     * send a command to a server
     *  the provided callback should be of ( error, result ) form
     *  result is one json received in answer of the command
     */
    static requestAnswer( port, command, cb ){
        coreLogger.debug( 'coreForkable.requestAnswer() port='+port+' command='+command );
        try {
            const client = net.createConnection( port, () => {
                client.write( command+'\r\n' );
            });
            client.on( 'data', ( data ) => {
                const _str = new Buffer.from( data ).toString();
                const _strs = _str.split( '\r\n' );
                let _jsons = [];
                _strs.every(( s ) => {
                    if( s && s.length ){
                        _jsons.push( JSON.parse( s ));
                    }
                    return true;
                });
                let _res = {};
                _jsons.every(( o ) => {
                    _res = {
                        ..._res,
                        ...o
                    };
                });
                cb( null, _res );
                client.end();
            });
        } catch( e ){
            cb( e, null );
        }
    }

    _status = null;
    _config = null;
    _server = null;

    // server is only instanciated in its own (forked child) process
    constructor( config ){
        coreLogger.debug( 'instanciating new coreForkable()' );
        this._config = config;
        this._status = coreForkable.s.STARTING;
        return this;
    }

    // send an IPC message to the parent when this (derived-class) server is bound
    //  this is this same exact object which will be written by the controller in its pid json file
    //  triggered in the child (forked) process
    advertiseParent( port, message, opts ){
        let _procName = Iztiar.getProcName();
        coreLogger.debug( _procName+' advertising parent' );
        try {
            this._status = coreForkable.s.RUNNING;
            let msg = {};
            msg[_procName] = {
                event: 'startup',
                pid: process.pid,
                config: this.getConfig(),
                status: this.runningStatus(),
                storageDir: Iztiar.getStorageDir(),
                listening: port,
                ...opts || {}
            };
            process.send( msg );
        } catch( e ){
            coreLogger.error( e );
        }
        coreLogger.setLog( coreConfig.getLogFilename());
        coreLogger.info( message );
    }

    // an error handler for derived classes
    //  triggered in the child (forked) process
    errorHandler( e ){
        if( e.stack ){
            coreLogger.error( e );
        }
        if( this._status !== coreForkable.s.STOPPING ){
            coreLogger.info( 'auto-killing on '+e.code+' error' );
            process.kill( process.pid, 'SIGTERM' );
        }
    }

    // returns the runtime configuration of this server
    getConfig(){
        return this._config;
    }

    // get/set the running status of this server
    runningStatus( status ){
        if( status && typeof status === 'string' ){
            this._status = status;
        }
        return this._status;
    }
}
