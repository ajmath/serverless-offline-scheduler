# THIS PROJECT IS NOT MAINTAINED

# serverless-offline-scheduler

[![npm version](https://badge.fury.io/js/serverless-offline-scheduler.svg)](https://www.npmjs.com/package/serverless-offline-scheduler)
[![CircleCI](https://circleci.com/gh/ajmath/serverless-offline-scheduler/tree/master.svg?style=svg&circle-token=ac52c4f1b600a5edb66302b5a2eabf986bfbc317)](https://circleci.com/gh/ajmath/serverless-offline-scheduler/tree/master)

Integrates with serverless-offline to run scheduled lambdas locally.  Can also be run independently

#### Usage ####
* Install module `npm i --save-dev serverless-offline-scheduler`
* Update serverless.yml
```
plugins:
  - serverless-offline-scheduler
```
* Your scheduled functions with cron syntax can be run with either
  * `sls schedule`
  * `sls offline start`
