/*
 * coreResult
 *  This is the preferred return format of synchronous functions
 */
import { Iztiar } from './global.js';

export class coreResult extends Error {
    
    constructor( cause, message ){
        super( message, { cause: cause });
        //console.log( 'instanciating new coreResult() cause %o message %o', cause, message );
        Iztiar.rt.log.debug( 'instanciating new coreResult() cause %o message %o', cause, message );
        return this;
    }
}
