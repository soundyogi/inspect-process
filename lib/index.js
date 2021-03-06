'use strict';

/* -----------------------------------------------------------------------------
 * dependencies
 * ---------------------------------------------------------------------------*/

// core
const path = require('path');
const spawn = require('child_process').spawn;

// 3rd party
const _ = require('lodash');
const which = require('which');
const exitHook = require('exit-hook');
const portfinder = require('portfinder');

// lib
const Devtools = require('./devtools');


/* -----------------------------------------------------------------------------
 * inspect
 * ---------------------------------------------------------------------------*/

module.exports = function (cmd, nodeArgs, childArgs) {
  return findOpenPort()
    .then((port) => inspectProcess(cmd, nodeArgs, childArgs, port));
};

const findOpenPort = function () {
  // node defaults to 9229 so lets start there
  portfinder.basePort = 9229;

  return new Promise(function(resolve, reject) {
    portfinder.getPort((err, port) => err ? reject(err) : resolve(port));
  });
};

const inspectProcess = function (cmd, nodeArgs, childArgs, port) {
  const getPathToCmd = function (cmd) {
    try { return which.sync(cmd); }
    catch (e) { return path.resolve(cmd); }
  };

  return new Promise(function (resolve, reject) {
    process.env['FORCE_COLOR'] = 1;

    const inspectArgs = ['--inspect=' + port, '--debug-brk'];
    const args = inspectArgs.concat(nodeArgs || [], [getPathToCmd(cmd)], childArgs || []);
    const proc = spawn('node', args);
    const devtools = new Devtools();

    const resolveWithResult = function () {
      return proc.exitCode ? reject() : resolve();
    };

    proc.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      const dataStr = data.toString();
      const isListening = dataStr.startsWith('Debugger listening on port');
      const isAttached = dataStr.startsWith('Debugger attached');
      const isComplete = dataStr.startsWith('Waiting for the debugger to disconnect');

      if (isListening) {
        return devtools.open(dataStr.substring(dataStr.indexOf('chrome-devtools')));

      } else if (isComplete) {
        return devtools.close();

      } else if (!isAttached) {
        return process.stderr.write(data);
      }
    });

    proc.once('exit', resolveWithResult);
    proc.once('SIGINT', resolveWithResult);
    proc.once('SIGTERM', resolveWithResult);

    // safegaurd to ensure processes are cleaned up on exit
    exitHook(() => {
      devtools.close();
      proc.kill();
    });
  });
};
