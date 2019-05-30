"use strict";

module.exports = class ServerlessBuilder {
  constructor(serverless) {
    const serverlessDefaults = {
      service: {
        provider: {
          name: "aws",
          stage: "dev",
          region: "us-east-1",
          runtime: "nodejs8.10"
        },
        functions: {},
        getFunction(functionName) {
          return this.functions[functionName];
        }
      },
      cli: {
        log: () => {}
      },
      version: "1.0.2",
      config: {
        servicePath: ""
      },
      pluginManager: {
        getPlugins: () => ({
          find: () => {}
        })
      }
    };
    this.serverless = Object.assign({}, serverless, serverlessDefaults);
    this.serverless.service.getFunction = this.serverless.service.getFunction.bind(
      this.serverless.service
    );
  }

  addFunction(functionName, functionConfig) {
    this.serverless.service.functions[functionName] = functionConfig;
  }

  toObject() {
    return this.serverless;
  }
};
