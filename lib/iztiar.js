/*
 * iztiar.js
 */

const co = {
};

let storageDir = null;
let processName = null;                 // may be undefined in main CLI process

export class Iztiar {

    /**
     * Some application-wide constants
     */
    static c = {
        app: {
            name: 'iztiar',
            default: 'default',
            none: 'none'
        },
        forkable: {
            uuid: 'iztiar-bc05bf55-4313-49d7-ab9d-106c93c335eb'
        },
        controller: {
            port: 24001
        },
        broker: {
            enabled: true,
            controllerPort: 24002,
            messagingPort: 24003
        },
        manager: {
            enabled: false
        }
    };

    /**
     * @returns the name of this process, taken from the running environment
     *  set in cli-runner.js as process.env[Iztiar.c.forkable.uuid]
     * @type string
     */
    static getProcName(){
        return processName;
    }

    /**
     * 
     * @returns 
     */
    static getStorageDir(){
        return storageDir;
    }

    /**
     * 
     * @returns 
     */
    static setProcName( name ){
        processName = name;
    }

    /**
     * 
     * @param {*} dir 
     */
    static setStorageDir( dir ){
        storageDir = dir;
    }
}
