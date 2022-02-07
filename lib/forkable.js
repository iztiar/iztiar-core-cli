/*
 * coreForkable
 */
import cp from 'child_process';
import net from 'net';
import { resolve } from 'path';
import pidusage from 'pidusage';

import { Iztiar, coreConfig, coreError, coreLogger, coreRunfile, utils } from './imports.js';

export class coreForkable {

    static s = {
        STARTING: 'starting',
        RUNNING: 'running',
        STOPPING: 'stopping'
    };

    /**
     * fork this process
     *  actually re-running our same CLI command in a dedicated environment
     *  (parent process)
     * @param {string} forkable the forkable to fork
     * @param {Callback} ipcCallback a ( child, messageData ) callback to be triggered when receiving IPC messages
     * @returns {ChidlProcess} the forked child process
     * 
     * Note:
     *  Node.js sets up a communication channel between the parent process and the forked child process.
     *  child.send( message ) is received on the callback below.
     *  Unfortunately this means that the parent has to stay running. which is not what we want
     *  (at least in the coreController case).
     *  So, the IPC channel is mainly used for advertising the parent of the startup event.
     * 
     * Note:
     *  Execute in parent process.
     */
    static startupFork( forkable, ipcCallback ){
        coreLogger.debug( 'coreForkable::startupFork() about to fork '+forkable );
        const _path = process.argv[1];
        let _args = process.argv;
        _args.shift();
        _args.shift();
        let _env = {
            ...process.env
        };
        _env[Iztiar.c.forkable.uuid] = forkable; // this says to the child that it has been forked
        let _options = {
            detached: true,
            env: _env
        };

        let child = cp.fork( _path, _args, _options );

        child.on( 'message', ( messageData ) => {
            ipcCallback( child, messageData );
        });

        return child;
    }

    /**
     * Forward to the parent process the startup message received from the child process
     * Note:
     *  This is a flat hierarchy where the main top coreController forwards to its main CLI process
     *  parent the IPC messages which are received from managed coreController(s) and coreBroker.
     *  The hierarchy is said flat because managed coreController(s) cannot manage themselves
     *  other coreControllers. So there is only one level.
     * 
     * @param {Object} messageData 
     */
     static startupOnIPCForward( messageData ){
        if( Iztiar.envForked() === Iztiar.c.forkable.CONTROLLER && messageData.event === 'startup' ){
            coreLogger.debug( 'coreForkable.startupOnIPCForward()', 'forwarding' );
            messageData.event = 'forwarded';
            process.send( messageData );
        }
    }

    /**
     * This function should be eventually called for each received IPC message for taking care of common tasks
     * - creates the JSON runfile
     * - forward messages to parent if needed
     * @param {ChildProcess} child the child process as returned by fork
     * @param {Object} messageData the data received through IPC channel
     */
    static startupOnIPCMessage( child, messageData ){
        const _forkable = Object.keys( messageData )[0];
        coreLogger.debug( 'coreForkable.startupOnIPCMessage()', messageData[_forkable].name, _forkable, messageData.event );
        coreForkable.startupOnIPCWriteRun( messageData );
        coreForkable.startupOnIPCForward( messageData );
    }

    /**
     * Write the JSON runfile for the newly forked child process
     * @param {Object} messageData the data transmitted by the forked process on startup
     * Note:
     *  This is a design decision to ask the parent to write the runfile for its child on 'startup' event.
     *  Doing that, we are sure that child is up and running when the runfile is written.
     */
    static startupOnIPCWriteRun( messageData ){
        if( messageData.event === 'startup' ){
            const _forkable = Object.keys( messageData )[0];
            coreRunfile.set( messageData[_forkable].name, _forkable, messageData[_forkable] );
        }
    }

    /**
     * @param {string} name the name of the service controller
     * @param {string} forkable the type of the coreForkable
     * @returns {Promise} which will eventually resolves with isAlive=true|false
     */
    static isAlive( name, forkable ){
        coreLogger.debug( 'coreForkable.isAlive()', name, forkable );
        const _processes = coreRunfile.processes( name );
        let _alive = false;
        if( !_processes || !_processes[forkable] ){
            coreLogger.debug( 'coreForkable.isAlive() forkable not found in runfile' );
            return Promise.resolve( false );
        }
        let _candidates = [];
        if( _processes[forkable].pid ){
            _candidates.push( utils.isAlivePid( _processes[forkable].pid ));
        }
        if( _processes[forkable].port ){
            _candidates.push( utils.isAlivePort( _processes[forkable].port ));
        }
        return new Promise(( resolve, reject ) => {
            Promise.all( _candidates )
                .then(( res ) => {
                    // res[0] is expected to be a one-row array with requested pid, or false
                    // res[1] is expected to be the iz.ack answer to iz.ping, or false
                    resolve( res[0] && res[1] );
                })
        });
    }

    /**
     * Request the child process for its status
     * @param {integer} port the communication port number
     * @returns {Promise} a promise which will eventually resolve with received answer, or falsy
     */
    static statusOf( port ){
        coreLogger.debug( 'coreForkable.statusOf()', 'port='+port, 'command=\''+command+'\'' );
        return utils.tcpRequest( port, 'iz.status' );
    }

    // the filled-up configuration passed-in at instanciation time
    _appConfig = null;
    _sceConfig = null;

    // the coreController name which manages this forkable
    _sceName = null;

    // service status
    _sceStatus = null;

    /**
     * @constructor
     * @param {string} sceName the name of the service
     * @param {Object} appConfig the application filled configuration
     * @param {Object} sceConfig the controller filled configuration
     * @returns {coreForkable}
     * @throws {coreError}
     * Note:
     *  As a reminder, the coreForkable is instanciated in its own run process
     *  (i.e. there is not instanciation in the main CLI process, the coreController is only instanciated
     *  in the controller process, and the coreBroker is only instanciated in the broker process).
     */
    constructor( sceName, appConfig, sceConfig ){
        if( !sceName || typeof sceName !== 'string' || !sceName.length ){
            throw new coreError( coreError.e.FORKABLE_NAMEUNSET );
        }
        if( !appConfig ){
            throw new coreError( coreError.e.FORKABLE_APPCONFUNSET );
        }
        if( !sceConfig ){
            throw new coreError( coreError.e.FORKABLE_CONTCONFUNSET );
        }
        coreLogger.debug( 'instanciating new coreForkable() sceName='+sceName );
        this._appConfig = appConfig;
        this._sceConfig = sceConfig;
        this._sceName = sceName;
        this._sceStatus = coreForkable.s.STARTING;

        return this;
    }

    /**
     * Send an IPC message to the parent when this (derived-class) server is ready
     * @param {integer} port the TCP port number this server is listening to
     * @param {string} message a Hello message to be written in the logfile
     * @param {*} data to be send to the parent, most probably a current status of the server
     * @throw {codeError}
     */
    startupAdvertiseParent( port, message, data ){
        let _procName = Iztiar.envForked();
        coreLogger.debug( _procName+' advertising parent' );
        // unfortunately this try/catch doesn't handle Error [ERR_IPC_CHANNEL_CLOSED]: Channel closed
        //  triggered by process.send() in coreController/coreBroker processes when CLI main process has terminated on timeout
        try {
            let _msg = { ...data };
            //console.log( 'data', data );
            _msg.event = 'startup';
            _msg[_procName].status = this.runningStatus( coreForkable.s.RUNNING );
            _msg[_procName].helloMessage = message;
            //console.log( '_msg', _msg );
            process.send( _msg );
            coreLogger.info( 'coreForkable.startupAdvertiseParent() sends', _msg );
        } catch( e ){
            coreLogger.error( e.name, e.message );
        }
    }

    /**
     * An error handler for derived classes
     * @param {Error} e exception on TCP server listening
     * (child process)
     */
    errorHandler( e ){
        coreLogger.debug( 'coreForkable:onErrorHandler() entering...' );
        if( e.stack ){
            coreLogger.error( e.name, e.message );
        }
        // for now, do not terminate on ECONNRESET
        //if( e.code === 'ECONNRESET' ){
        //    return;
        //}
        // not very sure this is good idea !?
        if( this._sceStatus !== coreForkable.s.STOPPING ){
            coreLogger.info( 'auto-killing on '+e.code+' error' );
            process.kill( process.pid, 'SIGTERM' );
            //process.kill( process.pid, 'SIGKILL' ); // if previous is not enough ?
        }
    }

    /**
     * Execute a command received on the TCP communication port
     * @param {string} cmd the received command, maybe with parameters
     * @param {Object} refs the commands known by the derived class (coreController/coreBroker)
     * @param {Callback} cb the callback to be called to send the answer
     *  cb will be called with ( result:Object ) arg.
     * @throws {coreError}
     */
    execute( cmd, refs, cb ){
        //coreLogger.debug( 'cmd', cmd );
        //coreLogger.debug( 'refs', refs );
        //coreLogger.debug( 'refs.keys', Object.keys( refs ));
        if( !cmd || typeof cmd !== 'string' || !cmd.length ){
            throw new coreError( coreError.e.FORKABLE_CMDUNSET );
        }
        const _words = cmd.split( ' ' );
        //coreLogger.debug( 'words', _words );
        if( !Object.keys( refs ).includes( _words[0] )){
            throw new coreError( coreError.e.FORKABLE_CMDUNKNOWN );
        }
        const _ocmd = refs[_words[0]];
        if( !_ocmd || !_ocmd.fn || typeof _ocmd.fn !== 'function' ){
            throw new coreError( coreError.e.FORKABLE_CMDNOTDEFINED );
        }
        _ocmd.fn( this, _words, cb );
        return _ocmd;
    }

    /**
     * @returns {Object} the filled application configuration passed-in at instanciation time
     */
    getAppConfig(){
        return this._appConfig;
    }

    /**
     * @returns {Object} the filled controller configuration passed-in at instanciation time
     */
    getServiceConfig(){
        return this._sceConfig;
    }

    /**
     * @returns {string} the name of the controller service
     */
    getName(){
        return this._sceName;
    }

    /**
     * Getter/Setter
     * @param {string} status the runtime status of the server
     * @returns the runtime status of the server
     */
    runningStatus( status ){
        if( status && typeof status === 'string' ){
            this._sceStatus = status;
        }
        return this._sceStatus;
    }
}
