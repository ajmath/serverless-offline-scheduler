'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const fs = require('fs');
const schedule = require('node-schedule');
const utils = require('./utils');

const pathBases = [
  '',
  '.webpack'
];

class Scheduler {
  constructor(serverless) {
    this.serverless = serverless;
  }

  run() {
    this.funcConfigs = this._getFuncConfigs();
    for(const i in this.funcConfigs) {
      const fConfig = this.funcConfigs[i];
      for(const j in fConfig.events) {
        const scheduleEvent = fConfig.events[j];
        const func = this._requireFunction(fConfig.id);
        if (!func) {
          continue;
        }
        this._setEnvironmentVars(fConfig.id); //TODO: Set this individually for each schedule

        this.serverless.cli.log(`scheduling ${fConfig.id} with ${scheduleEvent}`);
        schedule.scheduleJob(scheduleEvent, () => {
          this.serverless.cli.log(`Running scheduled job: ${fConfig.id}`)
          func(
            this._getEvent(),
            this._getContext(fConfig.id),
            (err, result) => {}
          )
        });
      }
    }
    return BbPromise.resolve();
  }

  _requireFunction(fName) {
    const functionObj = this.serverless.service.getFunction(fName);
    const handlerParts = functionObj.handler.split('.');
    const filename = handlerParts[0] + '.js';
    const handlerFunction = handlerParts[1];
    for (const base of pathBases) {
      const funcPath = path.join(this.serverless.config.servicePath, base, filename);
      if (fs.existsSync(funcPath)) {
        return require(funcPath);
      }
    }
    this.serverless.cli.log(`Unable to find source for ${fName}:${filename}`);
    return null;
  }

  _setEnvironmentVars(functionName) {
    const providerEnvVars = this.serverless.service.provider.environment || {};
    const functionEnvVars = this.serverless.service.functions[functionName].environment || {};

    Object.assign(process.env, providerEnvVars, functionEnvVars);
  }

  _getEvent() {
    return {
      //TODO: what else goes here?
      isOffline: true,
      stageVariables: this.serverless.service.custom.stageVariables
    }
  }

  _getContext(functionName) {
    return {
      awsRequestId: utils.guid(),
      invokeid: utils.guid(),
      logGroupName: `/aws/lambda/${functionName}`,
      logStreamName: '2016/02/14/[HEAD]13370a84ca4ed8b77c427af260',
      functionVersion: '$LATEST',
      isDefaultFunctionVersion: true,
      functionName: functionName,
      memoryLimitInMB: '1024',
    };
  }

  _convertScheduleToCron(scheduleEvent) {
    const params = scheduleEvent.replace('rate(', '')
      .replace('cron(', '')
      .replace(')', '');

    if (scheduleEvent.startsWith('cron(')) {
      return params;
    }
    if (scheduleEvent.startsWith('rate(')) {
      this.serverless.cli.log('Rate syntax not currently supported, will not schedule')
      return null;
    }

    this.serverless.cli.log('Invalid, schedule syntax');
    return null;
  }

  _getFuncConfigs() {
    const funcConfs = [];
    const inputfuncConfs = this.serverless.service.functions;
    for (let funcName in inputfuncConfs) {
      const funcConf = inputfuncConfs[funcName];
      const scheduleEvents = funcConf.events
        .filter(e => e.hasOwnProperty('schedule'))
        .map(e => e.schedule)
        .map(s => this._convertScheduleToCron(s))
        .filter(s => s);
      if (scheduleEvents.length > 0) {
        funcConfs.push({
          id: funcName,
          events: scheduleEvents,
          moduleName: funcConf.handler.split('.')[0],
        });
      }
    }
    return funcConfs;
  }
}
module.exports = Scheduler;
