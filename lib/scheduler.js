"use strict";

const BbPromise = require("bluebird");
const schedule = require("node-schedule");
const utils = require("./utils");
const childProcess = require("child_process");

const DEFAULT_TIMEOUT = 6;
const MS_PER_SEC = 1000;

class EventData {
  constructor(funcName, cron, rawEvent) {
    const event = rawEvent || {};

    this.name = funcName;
    this.cron = cron;
    this.enabled = event.enabled === undefined || event.enabled === null ? true : !!event.enabled;
    if (event.input) {
      this.input = event.input;
    }
    this.ruleName = event.name || funcName;
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
    const offlinePlugin = this.serverless.pluginManager
      .getPlugins()
      .find(
        (p) =>
          p.constructor &&
          (p.constructor.name === "ServerlessOffline" || p.constructor.name === "Offline")
      );

    if (offlinePlugin) {
      this.location = offlinePlugin.options.location;
    }
    this.funcConfigs = this._getFuncConfigs();

    for (const i in this.funcConfigs) {
      const fConfig = this.funcConfigs[i];
      for (const j in fConfig.events) {
        const eventData = fConfig.events[j];
        this._setEnvironmentVars(fConfig.id); //TODO: Set this individually for each schedule

        if (!eventData.enabled) {
          this.serverless.cli.log(`scheduler: not scheduling ${fConfig.id}/${eventData.name} `
            + `with ${eventData.cron}, since it's disabled`);
          continue;
        }

        this.serverless.cli.log(`scheduler: scheduling ${fConfig.id}/${eventData.name} `
          + `with ${eventData.cron}`);
        this.serverless.cli.log(`${eventData.name}`);
        schedule.scheduleJob(eventData.cron, () => {
          const func = this._executeFunction(fConfig.id, eventData.input);
          if (func === undefined) {
            this.serverless.cli.log(`scheduler: unable to find source for ${fConfig.id}`);
            return;
          }
          this.serverless.cli.log(`scheduler: Succesfully run scheduled job: ${fConfig.id}`);
        });
      }
    }
    return BbPromise.resolve();
  }

  _executeFunction(fName, fInput) {
    return childProcess.execSync(
      `serverless invoke local --function ${fName} --data ${JSON.stringify(fInput)}`,
      {cwd: "./", stdio: "inherit" });
  }

  _setEnvironmentVars(functionName) {
    const baseEnv = {
      IS_LOCAL: true,
      IS_OFFLINE: true
    };

    const providerEnvVars = this.serverless.service.provider.environment || {};
    const functionEnvVars = this.serverless.service.functions[functionName].environment || {};

    Object.assign(process.env, baseEnv, providerEnvVars, functionEnvVars);
  }

  _getEvent(args) {
    if (args.input) {
      return args.input;
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
        `arn:aws:events:serverless-offline:123456789012:rule/${args.ruleName}`
      ],
      "isOffline": true,
      "stageVariables": this.serverless.service.custom
        && this.serverless.service.custom.stageVariables
    };
  }

  _getContext(fConfig) {

    const functionName = fConfig.id;

    const timeout = fConfig.timeout || this.serverless.service.provider.timeout || DEFAULT_TIMEOUT;

    const endTime = Math.max(0, Date.now() + timeout * MS_PER_SEC);

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
      invokedFunctionArn: `arn:aws:lambda:serverless-offline:123456789012:function:${functionName}`,
      getRemainingTimeInMillis: () => endTime - Date.now()
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
          timeout: funcConf.timeout,
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
      rawEvent
      );
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
