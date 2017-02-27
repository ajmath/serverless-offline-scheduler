# serverless-offline-scheduler

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

#### Caveats ####

* rate schedule expressions are not supported, only cron
* Likely more to come!
