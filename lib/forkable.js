/*
 * coreForkable
 */
import cp from 'child_process';
import net from 'net';
import pidusage from 'pidusage';

import { Iztiar, coreConfig, coreError, coreForker, coreLogger, coreRunfile } from './imports.js';

    /*
     * receiving a message via the IPC channel from our forked child process
     * (parent process)
     * 
     * Note:
     *  the main CLI process must wait for the two children have successfully startup
     *  coreBroker [ipc] coreController
     */
    function _onIPCMessage( child, forker, messageData ){
        coreLogger.info( 'coreForkable::_onIPCMessage()', messageData );
        const _messageKeys = Object.keys( messageData );
        const _forkable = _messageKeys[0];

        if( messageData[_forkable].event === 'startup' ){
            //_onStartupMessage( child, forker, messageData );
            coreLogger.info( _forkable+' successfully started with pid '+messageData[_forkable].pid );
            forker.executeHandlers( child, messageData );
        }

        if( messageData[_forkable].event === 'forward' ){
            forker.executeHandlers( child, messageData );
        }
    }

export class coreForkable {

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
     * @param {coreForker} forker our companion forking object, instanciated by the derived class
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
    static fork( forker ){
        coreLogger.debug( 'coreForkable::fork() about to fork '+forker.forkable );
        const _path = process.argv[1];
        let _args = process.argv;
        _args.shift();
        _args.shift();
        let _env = {
            ...process.env
        };
        _env[Iztiar.c.forkable.uuid] = forker.forkable; // this says to the child that it has been forked
        let _options = {
            detached: true,
            env: _env
        };

        let child = cp.fork( _path, _args, _options );

        child.on( 'message', ( messageData ) => {
            _onIPCMessage( child, forker, messageData );
        });

        return child;
    }

    /**
     * Write the JSON runfile for the newly forked child process
     * @param {ChildProcess} child the forked process
     * @param {JSON} startupData the data transmitted by the forked process on startup
     * @param {Object} parms the parms defned when this callback has been registered
     * 
     * Note:
     *  Execute in parent process.
     */
    static onStartup( child, messageData, parms ){
        const _messageKeys = Object.keys( messageData );
        const _forkable = _messageKeys[0];
        const _config = messageData[_forkable].config;
        if( _config && _config.controller && _config.controller.name ){
            let _runfile = new coreRunfile( _config.controller.name, _forkable );
            _runfile.set( messageData[_forkable] );
        }
    }

    /*
    static async pidUsage( pid ){
        const _stats = await pidusage( pid );
        return _stats;
    }
    */
    static pidUsage( pid ){
        pidusage( pid, ( e, res ) => {
            coreLogger.debug( res );
        });
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
                //console.log( _strs );
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
            client.on( 'error', ( e ) => {
                coreLogger.error( 'coreForkable.requestAnswer() receives', e.name, e.message );
                cb( e, null );
            });
        } catch( e ){
            cb( e, null );
        }
    }

    /**
     * Request the child process for its status
     * @param {integer} port the communication port number
     * @param {Callback} cb the callback to be called when the broker will have answered
     *  callback is of the form ( error, result )
     */
    static statusOf( port, cb ){
        coreLogger.debug( 'requesting status on port '+port );
        coreForkable.requestAnswer( port, 'iz.status', cb );
    }

    // the runtime configuration passed-in at instanciation time
    _config = null;

    // the coreController name which manages this forkable
    _name = null;

    // the JSON runfile of the forkable
    _runfile = null;

    // server status
    _status = null;

    /**
     * @constructor
     * @param {Object} config runtime configuration for the forkable
     * @returns {coreForkable}
     * @throws {coreError}
     * Note:
     *  As a reminder, the coreForkable is instanciated in its own run process
     *  (i.e. there is not instanciation in the main CLI process, the coreController is only instanciated
     *  in the controller process, and the coreBroker is only instanciated in the broker process).
     */
    constructor( config ){
        coreLogger.debug( 'instanciating new coreForkable()' );
        if( !config ){
            throw new coreError( coreError.e.FORKABLE_CONFIGUNSET );
        }
        if( !config.controller || !config.controller.name || typeof config.controller.name !== 'string' || !config.controller.name.length ){
            throw new coreError( coreError.e.FORKABLE_CONFIGNAMEUNSET );
        }
        this._config = config;
        this._name = config.controller.name;
        this._status = coreForkable.s.STARTING;
        return this;
    }

    /**
     * Send an IPC message to the parent when this (derived-class) server is ready
     * @param {integer} port the TCP port number this server is listening to
     * @param {string} message a Hello message to be written in the logfile
     * @param {*} data to be send to the parent, most probably a current status of the server
     */
    advertiseParent( port, message, data ){
        let _procName = Iztiar.envForked();
        coreLogger.debug( _procName+' advertising parent' );
        try {
            this._status = coreForkable.s.RUNNING;
            let _parentMsg = { ...data };
            _parentMsg[_procName].event = 'startup';
            _parentMsg[_procName].status = this.runningStatus();
            _parentMsg[_procName].helloMessage = message;
            process.send( _parentMsg );
        } catch( e ){
            coreLogger.error( e.name, e.message );
        }
        coreLogger.info( message );
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
        if( this._status !== coreForkable.s.STOPPING ){
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
     * @returns {Object} the runtime configuration of this server passed-in at instanciation time
     */
    getConfig(){
        return this._config;
    }

    /**
     * @returns {string} the name of the controller service
     */
    getName(){
        return this._name;
    }

    /**
     * Getter/Setter
     * @param {coreRunfile|null} runfile the JSON runfile for this forkable
     * @throws {coreError}
     * @returns {coreRunfile}
     */
    runfile( runfile ){
        if( runfile && runfile instanceof coreRunfile ){
            this._runfile = runfile;
            coreLogger.debug( 'setting runfile ', runfile );
        }
        return this._runfile;
    }

    /**
     * Getter/Setter
     * @param {string} status the runtime status of the server
     * @returns the runtime status of the server
     */
    runningStatus( status ){
        if( status && typeof status === 'string' ){
            this._status = status;
        }
        return this._status;
    }
}
