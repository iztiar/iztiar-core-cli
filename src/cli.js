#!/usr/bin/env node
/*
 * Main command-line interface:
 *  - sets up the environment
 *  - manages the Iztiar controller(s).
 *
 * Command-line options:
 *  See coreCmdline class definition.
 * 
 * Environment:
 *  - NODE_ENV
 *  - DEBUG
 *  - IZTIAR_CONFIG
 *  - IZTIAR_ENV
 *  - IZTIAR_LOGLEVEL
 */
//console.log( 'iztiar startup: process %o', process );
process.title = "iztiar";

// Addresses the Iztiar lib and runs the entry point
import './cli-runner.js';
