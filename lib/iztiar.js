/*
 * iztiar.js
 */

let storageDir = null;
let processName = null;                 // undefined in main CLI process

export class Iztiar {

    /**
     * Some application-wide constants
     */
    static c = {
        app: {
            name: 'iztiar',
            default: 'default',
            none: 'none',
            displayedName: 'Iztiar'
        },
        forkable: {
            uuid: 'iztiar-bc05bf55-4313-49d7-ab9d-106c93c335eb',
            BROKER: 'coreBroker',
            CONTROLLER: 'coreController'
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
     * 
     * @returns 
     */
    static getStorageDir(){
        return storageDir;
    }

    /**
     * Getter/Setter
     * @param {string|null} forkable the identifier of the coreForkable class, valid values being:
     *  - Iztiar.c.forkable.BROKER
     *  - Iztiar.c.forkable.CONTROLLER
     * @returns {string|null} the forkable which identifies the current running environment
     */
    static envForked( forkable ){
        if( forkable && forkable.length && typeof forkable === 'string' ){
            processName = forkable;
        }
        return processName;
    }

    /**
     * 
     * @param {*} dir 
     */
    static setStorageDir( dir ){
        storageDir = dir;
    }
}
