/*
 * coreForkable
 */
import forker from 'child_process';

import { coreLogger } from './logger.js';
import { Iztiar } from './global.js';

export class coreForkable {

    static c = {
        FORKABLE_BROKER: 'coreBroker',
        FORKABLE_CONTROLLER: 'coreController'
    };

    static s = {
        STARTING: 'starting',
        RUNNING: 'running',
        STOPPING: 'stopping'
    };

    static id = 'iztiar-bc05bf55-4313-49d7-ab9d-106c93c335eb';

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

    // fork this process
    //  actually re-running our same CLI command in a dedicated environment because this will be a daemon
    //  ran from the main CLI process
    //  the provided callback will be triggered in the parent process when it will have received the child
    //  startup message
    static fork( id, cb ){
        coreLogger.debug( 'coreForkable::fork() about to fork '+id );
        let _path = process.argv[1];
        let _args = process.argv;
        _args.shift();
        _args.shift();
        let _env = {
            ...process.env
        };
        _env[coreForkable.id] = id; // this says to the child that it has been forked
        let _options = {
            detached: true,
            env: _env
        };

        let child = forker.fork( _path, _args, _options );

        child.on( 'message', ( obj ) => {
            coreLogger.info( 'coreForkable::on.message %o', obj );
            if( obj.event === 'startup' && obj.status === 'OK' ){
                coreLogger.info( obj.coreForkable+' successfully started with pid '+obj.pid );
                Iztiar.rt.action = Iztiar.action.DONE;
                if( cb && typeof cb === 'function' ){
                    cb( 0 );
                }
            }
        });

        return child;
    }

    // send an IPC message to the parent when this (derived-class) server is bound
    //  called from the child process
    advertiseParent(){
        coreLogger.debug( process.env[coreForkable.id]+' advertising parent' );
        try {
            process.send({ coreForkable: process.env[coreForkable.id], event: 'startup', pid: process.pid, status: 'OK' });
            this._status = coreForkable.s.RUNNING;
        } catch( e ){
            coreLogger.error( e );
        }
    }

    // an error handler for derived classes
    errorHandler( e ){
        if( e.stack ){
            coreLogger.error( e );
        }
        Iztiar.rt.action = Iztiar.action.ERR    ;
        if( this._status !== coreForkable.s.STOPPING ){
            coreLogger.info( 'auto-killing on '+e.code+' error' );
            process.kill( process.pid, 'SIGTERM' );
        }
    }

    // returns the runtime configuration of this server
    getConfig(){
        return this._config;
    }

    // returns the known status of this server
    getStatus(){
        return this._status;
    }
}
