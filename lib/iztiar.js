/*
 * iztiar.js
 */

let _processName = null;                 // undefined in main CLI process

export class Iztiar {

    /**
     * Some application-wide constants
     */
    static c = {
        app: {
            name: 'iztiar',
            default: 'default',
            none: 'none',
            displayedName: 'Iztiar',
            logLevel: 'info'
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
        verbose: {
            QUIET: 0,
            ERROR: 1,
            WARN: 2,
            NORMAL: 3,
            VERBOSE: 4,
            VERBOSEPLUS: 5,
            DEBUG: 6
        },
        exitCode: 0
    };

    /**
     * @returns {string|null} the forkable which identifies the current running process environment
     */
    static envForked(){
        return process.env[Iztiar.c.forkable.uuid];
    }

    /**
     * Getter/Setter
     * @param {integer} code the exit code to be set for the current running process
     * @returns {integer} the exit code currently set
     */
    static exitCode( code ){
        if( typeof code === 'number' ){
            Iztiar.c.exitCode = code;
        }
        return Iztiar.c.exitCode;
    }
}
