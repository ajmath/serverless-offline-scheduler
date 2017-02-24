'use strict';

const BbPromise = require('bluebird');

const Scheduler = require('./lib/scheduler');

class ServerlessOfflineScheduler {
  constructor(serverless) {
    this.serverless = serverless;
    this.scheduler = new Scheduler(serverless);

    this.commands = {
      schedule: {
        usage: 'Run scheduled lambadas locally',
        lifecycleEvents: [
          'run'
        ]
      }
    };
    this.hooks = {
      'schedule:run': () => {
        this.serverless.cli.log('running schedule');
        return this.scheduler.run();
      },
      'before:offline:start': () => {
        this.serverless.cli.log('offline start hook');
        return this.scheduler.run();
      }
    };
  }
}

module.exports = ServerlessOfflineScheduler;
