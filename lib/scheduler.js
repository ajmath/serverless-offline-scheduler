"use strict";

const BbPromise = require("bluebird");
const path = require("path");
const fs = require("fs");
const schedule = require("node-schedule");
const utils = require("./utils");

class EventData {
  constructor(name, cron, enabled, input) {
    this.name = name;
    this.cron = cron;
    this.enabled = enabled;
    if (enabled === undefined || enabled === null) {
      this.enabled = true;
    }
    if (input) {
      this.input = input;
    }
  }
}

class Scheduler {
  constructor(serverless) {
    this.serverless = serverless;
    this.location = "";
    this.run = this.run.bind(this);
    this._getFuncConfigs = this._getFuncConfigs.bind(this);
  }

  run() {
    const offlinePlugin = this.serverless.pluginManager.getPlugins()
      .find((p) => p.constructor && p.constructor.name === "Offline");
    if (offlinePlugin) {
      this.location = offlinePlugin.options.location;
    }
    this.funcConfigs = this._getFuncConfigs();
    for (const i in this.funcConfigs) {
      const fConfig = this.funcConfigs[i];
      for (const j in fConfig.events) {
        const eventData = fConfig.events[j];
        this._setEnvironmentVars(fConfig.id); //TODO: Set this individually for each schedule

        this.serverless.cli.log(`scheduler: scheduling ${fConfig.id}/${eventData.name} `
          + `with ${eventData.cron}`);
        schedule.scheduleJob(eventData.cron, () => {
          const func = this._requireFunction(fConfig.id);
          if (!func) {
            this.serverless.cli.log(`scheduler: unable to find source for ${fConfig.id}`);
            return;
          }
          this.serverless.cli.log(`scheduler: running scheduled job: ${fConfig.id}`);
          func(
            this._getEvent(eventData.input),
            this._getContext(fConfig.id),
            () => {}
          );
        });
      }
    }
    return BbPromise.resolve();
  }

  _requireFunction(fName) {
    const functionObj = this.serverless.service.getFunction(fName);
    const handlerParts = functionObj.handler.split(".");
    const filename = `${handlerParts[0] }.js`;
    const handlerFunction = handlerParts[1];
    const funcPath = path.join(
      this.serverless.config.servicePath,
      this.location || "", filename);
    if (fs.existsSync(funcPath)) {
      return require(funcPath)[handlerFunction];
    }
    return null;
  }

  _setEnvironmentVars(functionName) {
    const providerEnvVars = this.serverless.service.provider.environment || {};
    const functionEnvVars = this.serverless.service.functions[functionName].environment || {};

    Object.assign(process.env, providerEnvVars, functionEnvVars);
  }

  _getEvent(input) {
    if (input) {
      return input;
    }

    return {
      "account": "123456789012",
      "region": "serverless-offline",
      "detail": {},
      "detail-type": "Scheduled Event",
      "source": "aws.events",
      "time": new Date().toISOString(),
      "id": utils.guid(),
      "resources": [
        "arn:aws:events:serverless-offline:123456789012:rule/my-schedule"
      ],
      "isOffline": true,
      "stageVariables": this.serverless.service.custom
        && this.serverless.service.custom.stageVariables
    };
  }

  _getContext(functionName) {
    return {
      awsRequestId: utils.guid(),
      invokeid: utils.guid(),
      logGroupName: `/aws/lambda/${functionName}`,
      logStreamName: "2016/02/14/[HEAD]13370a84ca4ed8b77c427af260",
      functionVersion: "$LATEST",
      isDefaultFunctionVersion: true,
      functionName,
      memoryLimitInMB: "1024",
      callbackWaitsForEmptyEventLoop: true,
      invokedFunctionArn: `arn:aws:lambda:serverless-offline:123456789012:function:${functionName}`
    };
  }

  _convertRateToCron(rate) {
    const parts = rate.split(" ");
    if (!parts[1]) {
      this.serverless.cli.log(`scheduler: Invalid rate syntax '${rate}', will not schedule`);
      return null;
    }

    if (parts[1].startsWith("minute")) {
      return `*/${parts[0]} * * * *`;
    }

    if (parts[1].startsWith("hour")) {
      return `0 */${parts[0]} * * *`;
    }

    if (parts[1].startsWith("day")) {
      return `0 0 */${parts[0]} * *`;
    }

    this.serverless.cli.log(`scheduler: Invalid rate syntax '${rate}', will not schedule`);
    return null;
  }

  _convertCronSyntax(cronString) {
    const CRON_LENGTH_WITH_YEAR = 6;
    if (cronString.split(" ").length < CRON_LENGTH_WITH_YEAR) {
      return cronString;
    }

    return cronString.replace(/\s\S+$/, "");
  }

  _convertExpressionToCron(scheduleEvent) {
    const params = scheduleEvent
      .replace("rate(", "")
      .replace("cron(", "")
      .replace(")", "");

    if (scheduleEvent.startsWith("cron(")) {
      return this._convertCronSyntax(params);
    }
    if (scheduleEvent.startsWith("rate(")) {
      return this._convertRateToCron(params);
    }

    this.serverless.cli.log("scheduler: invalid, schedule syntax");
    return null;
  }

  _getFuncConfigs() {
    const funcConfs = [];
    const inputfuncConfs = this.serverless.service.functions;
    for (const funcName in inputfuncConfs) {
      const funcConf = inputfuncConfs[funcName];
      const scheduleEvents = funcConf.events
        .filter((e) => e.hasOwnProperty("schedule"))
        .map((e) => this._parseEvent(funcName, e.schedule))
        .filter((s) => s);
      if (scheduleEvents.length > 0) {
        funcConfs.push({
          id: funcName,
          events: scheduleEvents,
          moduleName: funcConf.handler.split(".")[0]
        });
      }
    }
    return funcConfs;
  }

  _parseScheduleObject(funcName, rawEvent) {
    return new EventData(
      funcName,
      this._convertExpressionToCron(rawEvent.rate),
      rawEvent.enabled,
      rawEvent.input);
  }

  _parseScheduleExpression(funcName, expression) {
    return new EventData(funcName, this._convertExpressionToCron(expression));
  }

  _parseEvent(funcName, rawEvent) {
    if (typeof rawEvent === "string") {
      return this._parseScheduleExpression(funcName, rawEvent);
    }
    return this._parseScheduleObject(funcName, rawEvent);
  }
}
module.exports = Scheduler;
