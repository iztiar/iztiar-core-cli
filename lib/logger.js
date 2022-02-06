/*
 * coreLogger
 *  Personalize here the Pino logger for Iztiar suits.
 *  The logger's level is taken from config.json external file
 * 
 * Note:
 *  coreLogger must be initialized via coreLogger.init() before use.
 * 
 * Rationales:
 *  - loggins means write into a log file for future seeing
 *  - thanks to loglevel, program sends its lines, and the class chooses what exactly actually write
 */
import chalk from 'chalk';
import pino from 'pino';

import { Iztiar, coreConfig, utils } from './imports.js';

// injects an 'origin' prefix at the start of logged messages
function _emitter(){
    return Iztiar.envForked() || 'main';
}

//function _stringify(){
//    console.log( arguments );
//    return _emitter() + ' ' + Object.values( arguments ).join( ' ' );
//}

function _log(){
    arguments[0] = arguments[0].toUpperCase();
    const color = arguments[1];
    delete arguments[1];
    //console.log( arguments );
    if( _logger ){
        const _level = arguments[0];
        const _lower = _level.toLowerCase();
        // check that the level is allowed for the current transport
        //  may be overriden with IZTIAR_DEBUG
        if( !_logger.isLevelEnabled( _lower ) && process.env.IZTIAR_DEBUG && process.env.IZTIAR_DEBUG.includes( 'logLevel' )){
            console.log( color( _emitter(), '(not allowed log level)', ...arguments ));
        } else {
            _logger[_lower]([ _emitter(), ...arguments ]);
            //_logger[_lower]( color( [ _emitter(), ...arguments ]));
        }
    // before any logger be instanciated, one can still log the main CLI process
    } else if( !Iztiar.envForked() && process.env.IZTIAR_DEBUG && process.env.IZTIAR_DEBUG.includes( 'preCore' )){
        console.log( color( _emitter(), ...arguments ));
    }
}

let _logFilename = null;
let _logOptions = null;
let _logger = null;

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
     *                      trace()                                                 trace()
     *
     * Messages with DEBUG level are only displayed if explicitly enabled.
     */

    static l = {
        FATAL: "fatal",
        ERROR: "error",
        WARN: "warn",
        INFO: "info",
        DEBUG: "debug",
        TRACE: "trace"
    };

    /*
     * a way of managing logging before any Logger be instanciated
     *  generalizing that, calling these static methods is the only API the application needs to know
     */
    static fatal(){
        _log( coreLogger.l.FATAL, chalk.red.bgYellow, ...arguments );
    }

    static error(){
        _log( coreLogger.l.ERROR, chalk.red, ...arguments );
        /*
      const e = arguments[0];
        if( e instanceof Error ){
            console.log( ...arguments );
            // unable to handle Error's
            //_log( coreLogger.l.ERROR, arguments );
            //_log( coreLogger.l.ERROR, ...arguments );
            //_log( coreLogger.l.ERROR, [arguments] );
            //_log( coreLogger.l.ERROR, [...arguments] );
            //
        } else {
            _log( coreLogger.l.ERROR, ...arguments );
        }
        */
    }

    static warn(){
        _log( coreLogger.l.WARN, chalk.yellow, ...arguments );
    }

    static info(){
        _log( coreLogger.l.INFO, chalk.green, ...arguments );
    }

    static debug(){
      _log( coreLogger.l.DEBUG, chalk.blue, ...arguments );
    }

    static trace(){
        _log( coreLogger.l.TRACE, chalk.black.bgWhite, ...arguments );
    }

    /**
     * Getter/Setter
     * @param {string|null} level new log level
     * @returns {string} the loglevel
     * @throws {coreError}
     */
    static logLevel( level ){
        if( level && typeof level === 'string' && level.length && Objects.values( coreLogger.l ).includes( level )){
            if( _logger ){
                _logOptions.level = level;
                _logger = pino( _logOptions, pino.destination( _logFilename ));
            }
        }
        return _logOptions.level
    }

    /**
     * Getter/Setter
     * Set the log filename
     * Until that, logs are sent to the console.
     * @param {string|null} fname
     * @returns {string} the current log filename
     * @throws {coreError}
     */
    static logFile( fname ){
        if( fname && typeof fname === 'string' && fname.length ){
            if( _logger ){
                utils.makeFnameDirExists( fname );
                _logFilename = fname;
            }
        }
        return _logFilename;
    }

    /**
     * Initialize the coreLogger logging system
     * @param {string} name the application name
     * @param {Object} appConfig the filled-up runtime application configuration
     */
    static init( name, appConfig ){
      //console.log( name );
      //console.log( appConfig );
        _logOptions = {
            name: name,
            level: appConfig.logLevel
        };
        _logFilename = coreConfig.logFilename();
        utils.makeFnameDirExists( _logFilename );
        _logger = pino( _logOptions, pino.destination( _logFilename ));
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
