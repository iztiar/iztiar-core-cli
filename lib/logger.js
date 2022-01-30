/*
 * coreLogger
 * Personalize here the Pino logger for Iztiar suits.
 * Exports a 'coreLogger' class which overheads the 'pino' package.
 * The logger's level is taken from config.json external file
 */
import chalk from 'chalk';
import pino from 'pino';

import { coreForkable } from './forkable.js';

export class coreLogger {

    /**
     * Log levels are used to indicate the importance of the logged message.
     * Iztiar associates a distinct color to every of these levels.
     * 
     * According to man syslog(2), conventional meaning of the log level is as follows:
     *   Kernel constant   Level value   Meaning
     *   KERN_EMERG             0        System is unusable
     *   KERN_ALERT             1        Action must be taken immediately
     *   KERN_CRIT              2        Critical conditions
     *   KERN_ERR               3        Error conditions
     *   KERN_WARNING           4        Warning conditions
     *   KERN_NOTICE            5        Normal but significant condition
     *   KERN_INFO              6        Informational
     *   KERN_DEBUG             7        Debug-level messages
     *
     * According to Pino API, the default logging methods are trace, debug, info, warn, error, and fatal.
     *
     * We so have following mapping:
     *   Kernel constant    Pino method                                             coreLogger
     *   ---------------    -----------                                             ----------
     *   KERN_EMERG         fatal()                                                 fatal()
     *   KERN_ALERT                     -> ignored here, assimilated to fatal()
     *   KERN_CRIT                      -> ignored here, assimilated to fatal()
     *   KERN_ERR           error()                                                 error()
     *   KERN_WARNING       warn()                                                  warn()
     *   KERN_NOTICE                    -> ignored here, assimilated to info()
     *   KERN_INFO          info()                                                  info()
     *   KERN_DEBUG         debug()                                                 debug()
     *                      trace()     -> ignored here, assimilated to debug()
     *
     * Messages with DEBUG level are only displayed if explicitly enabled.
     */

    static level = {
        FATAL: "fatal",
        ERROR: "error",
        WARN: "warn",
        INFO: "info",
        DEBUG: "debug"
    };

    static _logger = null;
  
    _prefix = null;
    _parent = null

    // injects an 'origin' prefix at the start of logged messages
    static _Emitter(){
      return process.env[coreForkable.id] || 'main';
    }

    // eventually log to the console
    static _Console( level, args ){
        console.log([ coreLogger._Emitter(), 'coreLogger::'+level, ...args ]);
    }

    // a way of managing logging before any Logger be instanciated
    //  genralizing that, calling these static methods is the only API the application needs to know
    static fatal(){
        if( coreLogger._logger ){
            coreLogger._logger.fatal([ coreLogger._Emitter(), ...arguments ]);
        } else {
            //coreLogger._Console( 'FATAL', argument );
            console.log( coreLogger._Emitter(), 'coreLogger::FATAL ', arguments );
        }
    }
    static error(){
        if( coreLogger._logger ){
            coreLogger._logger.error([ coreLogger._Emitter(), ...arguments ]);
        } else {
            //coreLogger._Console( 'ERROR', argument );
            console.log( coreLogger._Emitter(), 'coreLogger::ERROR ', arguments );
        }
    }
    static warn(){
        if( coreLogger._logger ){
            coreLogger._logger.warn([ coreLogger._Emitter(), ...arguments ]);
        } else {
            //coreLogger._Console( 'WARN', argument );
            console.log( coreLogger._Emitter(), 'coreLogger::WARN ', arguments );
        }
    }
    static info(){
        if( coreLogger._logger ){
            coreLogger._logger.info([ coreLogger._Emitter(), ...arguments ]);
        } else {
            //coreLogger._Console( 'INFO', argument );
            console.log( coreLogger._Emitter(), 'coreLogger::INFO ', arguments );
        }
    }
    static debug(){
        if( coreLogger._logger ){
            coreLogger._logger.debug([ coreLogger._Emitter(), ...arguments ]);
        } else {
            //coreLogger._Console( 'DEBUG', argument );
            console.log( coreLogger._Emitter(), 'coreLogger::DEBUG ', arguments );
        }
    }

    // coreLogger instanciation should at least specify a prefix (the name of the owning process)
    constructor( options ){
        if( coreLogger._logger ){
            return coreLogger._logger
        }
        coreLogger.debug( 'instanciating new coreLogger() options %o', options );
        let _opts = {};
        if( options ){
            if( options.prefix ){
                this._prefix = options.prefix;
            } else if( options.name ){
                this._prefix = options.name;
            } else if( typeof options === 'string' ){
                this._prefix = options;
            }
        }
        _opts.name = this._prefix;
        if( options && options.config ){
            const _level = options.config.getLogLevel();
            _opts.level = coreLogger.level[_level] || 'info';
        }
        this._parent = pino( _opts );
        coreLogger._logger = this;
        return this;
    }

    fatal( msg ){
        this._parent.fatal( msg );
    }

    error( msg ){
        this._parent.error( msg );
    }

    warn( msg ){
        this._parent.warn( msg );
    }

    info( msg ){
        this._parent.info( msg );
    }

    debug( msg ){
        this._parent.debug( msg );
    }
}

/************************************************************************************************************************************************** *
************************************************************************************************************************************************** *

* eslint-disable @typescript-eslintno-explicit-any 
import util from "util";

**
 *
 * - INFO: no color
 * - WARN: yellow
 * - ERROR: red
 * - DEBUG: gray
 *
 * **
 * Represents a logging device which can be used directly as a function (for INFO logging)
 * but also has dedicated logging functions for respective logging levels.
 *
export interface Logging {

  prefix: string;

  (message: string, ...parameters: any[]): void;

  info(message: string, ...parameters: any[]): void;
  warn(message: string, ...parameters: any[]): void;
  error(message: string, ...parameters: any[]): void;
  debug(message: string, ...parameters: any[]): void;
  log(level: LogLevel, message: string, ...parameters: any[]): void;

}

interface IntermediateLogging {  * some auxiliary interface used to correctly type stuff happening in "withPrefix"

  prefix?: string;

  (message: string, ...parameters: any[]): void;

  info?(message: string, ...parameters: any[]): void;
  warn?(message: string, ...parameters: any[]): void;
  error?(message: string, ...parameters: any[]): void;
  debug?(message: string, ...parameters: any[]): void;
  log?(level: LogLevel, message: string, ...parameters: any[]): void;

}

**
 * Logger class
 *
export class Logger {

  public static readonly internal = new Logger();

  private static readonly loggerCache = new Map<string, Logging>();  * global cache of logger instances by plugin name
  private static debugEnabled = false;
  private static timestampEnabled = true;

  readonly prefix?: string;

  constructor(prefix?: string) {
    this.prefix = prefix;
  }


  **
   * Creates a new Logging device with a specified prefix.
   *
   * @param prefix {string} - the prefix of the logger
   *
  static withPrefix(prefix: string): Logging {
    const loggerStuff = Logger.loggerCache.get(prefix);

    if (loggerStuff) {
      return loggerStuff;
    } else {
      const logger = new Logger(prefix);

      const log: IntermediateLogging = logger.info.bind(logger);
      log.info = logger.info;
      log.warn = logger.warn;
      log.error = logger.error;
      log.debug = logger.debug;
      log.log = logger.log;

      log.prefix = logger.prefix;


       * eslint-disable-next-line @typescript-eslintban-ts-comment
       * @ts-ignore
      const logging: Logging = log;  * i aimed to not use ts-ignore in this project, but this evil "thing" above is hell
      Logger.loggerCache.set(prefix, logging);
      return logging;
    }
  }

  **
   * Turns on debug level logging. Off by default.
   *
   * @param enabled {boolean}
   *
  public static setDebugEnabled(enabled = true): void {
    Logger.debugEnabled = enabled;
  }

  **
   * Turns on inclusion of timestamps in log messages. On by default.
   *
   * @param enabled {boolean}
   *
  public static setTimestampEnabled(enabled = true): void {
    Logger.timestampEnabled = enabled;
  }

  **
   * Forces color in logging output, even if it seems like color is unsupported.
   *
  public static forceColor(): void {
    chalk.level = 1;  * `1` - Basic 16 colors support.
  }


  public info(message: string, ...parameters: any[]): void {
    this.log(LogLevel.INFO, message, ...parameters);
  }

  public warn(message: string, ...parameters: any[]): void {
    this.log(LogLevel.WARN, message, ...parameters);
  }

  public error(message: string, ...parameters: any[]): void {
    this.log(LogLevel.ERROR, message, ...parameters);
  }

  public debug(message: string, ...parameters: any[]): void {
    this.log(LogLevel.DEBUG, message, ...parameters);
  }

  public log(level: LogLevel, message: string, ...parameters: any[]): void {
    if (level === LogLevel.DEBUG && !Logger.debugEnabled) {
      return;
    }

    message = util.format(message, ...parameters);

    let loggingFunction = console.log;
    switch (level) {
      case LogLevel.WARN:
        message = chalk.yellow(message);
        loggingFunction = console.error;
        break;
      case LogLevel.ERROR:
        message = chalk.red(message);
        loggingFunction = console.error;
        break;
      case LogLevel.DEBUG:
        message = chalk.gray(message);
        break;
    }

    if (this.prefix) {
      message = getLogPrefix(this.prefix) + " " + message;
    }

    if (Logger.timestampEnabled) {
      const date = new Date();
      message = chalk.white(`[${date.toLocaleString()}] `) + message;
    }

    loggingFunction(message);
  }

}

**
 * Creates a new Logging device with a specified prefix.
 *
 * @param prefix {string} - the prefix of the logger
 * @deprecated please use {@link Logger.withPrefix} directly
 *
export function withPrefix(prefix: string): Logging {
  return Logger.withPrefix(prefix);
}

**
 * Gets the prefix
 * @param prefix 
 *
export function getLogPrefix(prefix: string): string {
  return chalk.cyan(`[${prefix}]`);
}
*/
