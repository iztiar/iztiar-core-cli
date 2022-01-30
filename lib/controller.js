/*
 * coreController
 *
 * There is at least one controller, but we may be able to have to manager several
 */
import fs from 'fs';
import net from 'net';
import path from 'path';

import { coreForkable } from './forkable.js';
import { coreLogger } from './logger.js';
import { Iztiar } from './global.js';

export class coreController extends coreForkable {

    static defaults = {
        port: 24001
    };

    _brokers = [];

    // at instanciation time, get the runtime configuration of the controller
    //  read from stored json configuration, maybe superseded by the command-line
    constructor( config ){
        super( config );
        coreLogger.debug( 'instanciating new coreController()' );
        return this;
    }

    // write PID of our (chid forked) process in <pidDir>
    _writePid(){
        const _dir = Iztiar.rt.config.getPidDir();
        const _file = path.join( _dir, Iztiar.rt.config.getControllerRuntimeName( this._config.name )+'.json' );
        const _json = {
            "pid": process.pid
        };
        fs.mkdir( _dir, { recursive: true }, ( e ) => {
            if( e ){
                coreLogger.error( e );
            } else {
                fs.writeFile( _file, JSON.stringify( _json ), { encoding: 'utf8' }, ( e ) => {
                    if( e ){
                        coreLogger.error( e );
                    } else {
                        coreLogger.debug( 'pid file successfully written in '+_file );
                    }
                })
            }
        })
    }

    // child here is the Node.js ChildProcess as returned when forking the broker
    registerBroker( child ){
        this._brokers.push( child );
    }

    // start the named controller
    start(){
        coreLogger.debug( 'coreController::start()' );
        this._server = net.createServer(( connection ) => {
            coreLogger.debug( 'coreController::start() incoming connection' );
        });

        this._server.listen( this._config.controller.port, () => {
            this.advertiseParent();
            Iztiar.rt.controllers.push( this );
            this._writePid();

        }).on( 'error', ( e ) => {
            this.errorHandler( e );
        });
    }
}
