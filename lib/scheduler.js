'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const schedule = require('node-schedule');
const utils = require('./utils');

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
        const functionObj = this.serverless.service.getFunction(fConfig.id);
        const handlerParts = functionObj.handler.split('.');
        const filename = handlerParts[0] + '.js';
        const handlerFunction = handlerParts[1];

        //TODO: Set this individually for each schedule
        this.setEnvironmentVars(fConfig.id);
        const importedHandler = require(path.join(this.serverless.config.servicePath, filename));

        this.serverless.cli.log(`scheduling ${fConfig.id} with ${scheduleEvent}`);
        schedule.scheduleJob(scheduleEvent, () => {
          this.serverless.cli.log(`Running scheduled job: ${fConfig.id}`)
          importedHandler[handlerFunction](
            this.getEvent(),
            this.getContext(fConfig.id),
            (err, result) => {}
          )
        });
      }
    }
    return BbPromise.resolve();
  }

  setEnvironmentVars(functionName) {
    const providerEnvVars = this.serverless.service.provider.environment || {};
    const functionEnvVars = this.serverless.service.functions[functionName].environment || {};

    Object.assign(process.env, providerEnvVars, functionEnvVars);
  }

  getEvent() {
    return {
      //TODO: what else goes here?
      isOffline: true,
      stageVariables: this.serverless.service.custom.stageVariables
    }
  }

  getContext(functionName) {
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
