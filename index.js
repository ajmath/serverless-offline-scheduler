"use strict";

const Scheduler = require("./lib/scheduler");

class ServerlessOfflineScheduler {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.scheduler = new Scheduler(serverless, options);
    this.options = options;
    this.commands = {
      schedule: {
        usage: "Run scheduled lambadas locally",
        lifecycleEvents: ["run"],
        options: {
          runSchedulesOnInit: {
            usage:
              "run scheduled functions immediately in addition to defined interval" +
              "(e.g \"--runSchedulesOnInit\")",
            required: false,
            type: "boolean"
          }
        }
      }
    };
    this.hooks = {
      "schedule:run": (opts) => this.scheduler.run(opts),
      "before:offline:start:init": (opts) => this.scheduler.run(opts)
    };
  }
}

module.exports = ServerlessOfflineScheduler;
