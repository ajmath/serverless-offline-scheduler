"use strict";

const schedule = require("node-schedule");
const utils = require("./utils");
const childProcess = require("child_process");

const DEFAULT_TIMEOUT = 6;
const MS_PER_SEC = 1000;

class EventData {
  constructor(funcName, cron, stageVariables, rawEvent) {
    const event = rawEvent || {};

    this.name = funcName;
    this.cron = cron;
    this.enabled = event.enabled === undefined || event.enabled === null ? true : !!event.enabled;
    this.ruleName = event.name || funcName;
    this.rawInput = event.input;
    this.stageVariables = stageVariables;
    this.input = this._getEvent();
  }

  _getEvent() {
    if (this.rawInput) {
      return this.rawInput;
    }

    return {
      account: "123456789012",
      region: "serverless-offline",
      detail: {},
      "detail-type": "Scheduled Event",
      source: "aws.events",
      time: new Date().toISOString(),
      id: utils.guid(),
      resources: [`arn:aws:events:serverless-offline:123456789012:rule/${this.ruleName}`],
      isOffline: true,
      stageVariables: this.stageVariables,
    };
  }
}

class Scheduler {
  constructor(serverless, options = {}) {
    this.serverless = serverless;
    this.options = options;
    this.run = this.run.bind(this);
    this._getFuncConfigs = this._getFuncConfigs.bind(this);
  }

  run(opts) {
    const options = Object.assign(this.options, opts);

    this.funcConfigs = this._getFuncConfigs();

    for (const i in this.funcConfigs) {
      const fConfig = this.funcConfigs[i];
      for (const j in fConfig.events) {
        const eventData = fConfig.events[j];
        this._setEnvironmentVars(fConfig.id); //TODO: Set this individually for each schedule

        if (!eventData.enabled) {
          this.serverless.cli.log(
            `scheduler: not scheduling ${fConfig.id}/${eventData.name} ` +
              `with ${eventData.cron}, since it's disabled`
          );
          continue;
        }

        this.serverless.cli.log(`scheduler: scheduling ${fConfig.id}/${eventData.name} `
          + `with ${eventData.cron}`);
        this.serverless.cli.log(`${eventData.name}`);
        schedule.scheduleJob(eventData.cron, () => {
          this._executeFunction(fConfig.id, eventData.input);
        });

        if (options.runSchedulesOnInit) {
          this._executeFunction(fConfig.id, eventData.input);
        }
      }
    }
    return Promise.resolve();
  }

  _executeFunction(fName, fInput) {
    const args = [process.argv[1], "invoke", "local", "--function", fName]
    if (fInput) {
      args.push("--data", JSON.stringify(fInput));
    }
    for (const { name, value } of this._getSlsInvokeOptions()) {
      args.push(`--${name}`, value);
    }
    return childProcess.execFileSync(process.argv[0], args, { cwd: "./", stdio: "inherit" });
  }

  _getSlsInvokeOptions() {
    if (!this.serverless.processedInput) {
      return [];
    }

    const opts = this.serverless.processedInput.options;
    return Object.keys(opts)
      .filter((k) => k !== "runSchedulesOnInit")
      .filter((k) => opts[k])
      .map((k) => ({ name: k, value: opts[k] }));
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
        .filter((e) => Object.prototype.hasOwnProperty.call(e, "schedule"))
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
    return new EventData(funcName, this._convertExpressionToCron(rawEvent.rate), this._getStageVariables(), rawEvent);
  }

  _parseScheduleExpression(funcName, expression) {
    return new EventData(funcName, this._convertExpressionToCron(expression), this._getStageVariables());
  }

  _getStageVariables() {
    return this.serverless.service.custom && this.serverless.service.custom.stageVariables;
  }

  _parseEvent(funcName, rawEvent) {
    if (typeof rawEvent === "string") {
      return this._parseScheduleExpression(funcName, rawEvent);
    }
    return this._parseScheduleObject(funcName, rawEvent);
  }
}
module.exports = Scheduler;
