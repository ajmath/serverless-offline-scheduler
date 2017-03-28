"use strict";

const Scheduler = require("./lib/scheduler");

class ServerlessOfflineScheduler {
  constructor(serverless) {
    this.serverless = serverless;
    this.scheduler = new Scheduler(serverless);

    this.commands = {
      schedule: {
        usage: "Run scheduled lambadas locally",
        lifecycleEvents: [
          "run"
        ]
      }
    };
    this.hooks = {
      "schedule:run": () => this.scheduler.run(),
      "before:offline:start:init": () => this.scheduler.run()
    };
  }
}

module.exports = ServerlessOfflineScheduler;
