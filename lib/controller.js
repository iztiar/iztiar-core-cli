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

    static err = {
        UNKNOWN_COMMAND: 'coreController::unknown-command'
    };

    static defaults = {
        port: 24001
    };

    _brokers = [];

    // get the status of the controller identified by its pid
    //  callback is of the form ( error, result )
    static StatusOf( port, cb ){
        console.log( 'requesting for status on port '+port );
        try {
            const client = net.createConnection( port, () => {
                client.write( 'iz.status\r\n' );
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
            "pid": process.pid,
            "listening": this._config.controller.port
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

    // return a JSON object with the status of this controller
    getControllerStatus(){
        let res = {
            status: this.getStatus(),
            config: this.getConfig(),
            storageDir: Iztiar.rt.storageDir,
            version: Iztiar.rt.package.getVersion(),
            environment: {
                iztiar: process.env.IZTIAR_ENV || 'undefined',
                node: process.env.NODE_ENV || 'undefined'
            },
            pid: process.pid,
            coreForkable: process.env[coreForkable.id],
            brokers: []
        };
        this._brokers.every(( b ) => {
            res.brokers.push({
                coreForkable: coreForkable.c.FORKABLE_BROKER,
                pid: b.pid
            });
            return true;
        });
        return res;
    }

    // child here is the Node.js ChildProcess as returned when forking the broker
    registerBroker( child ){
        this._brokers.push( child );
    }

    // start the named controller
    start(){
        coreLogger.debug( 'coreController::start()' );
        this._server = net.createServer(( c ) => {
            // may receive several commands/informations in each message
            //  answer with a json per command/information
            //  so a c.write() occurrence per non-empty received command in the buffer
            //coreLogger.debug( 'coreController::start() incoming connection' );
            //console.log( c );
            c.on( 'data', ( data ) => {
                //console.log( data );
                const _str = new Buffer.from( data ).toString();
                const _strs = _str.split( '\r\n' );
                _strs.every(( s ) => {
                    let _obj = {};
                    if( s && s.length ){
                        switch( s ){
                            case 'iz.status':
                                _obj = this.getControllerStatus();
                                break;
                            default:
                                _obj = { code: coreController.e.UNKNOWN_COMMAND, command: s };
                                break;
                        }
                        //console.log( 'sending ', _obj );
                        c.write( JSON.stringify( _obj )+'\r\n' );
                    }
                    return( true );
                })
            });
        });
        this._server
            .listen( this._config.controller.port, '0.0.0.0', () => {
                this.advertiseParent();
                this._writePid();
            })
            .on( 'error', ( e ) => {
                this.errorHandler( e );
            })
            .on( 'data', ( data ) => {
                console.log( process.env[coreForkable.id], data );
            });
    }
}
