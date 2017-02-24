'use strict';

const chai = require('chai');
const Serverless = require('serverless');
const expect = chai.expect;

const Scheduler = require('../lib/scheduler');

describe('validate', () => {
  let module;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.cli = {
      log: (l) => { }
    };
    module = new Scheduler(serverless);
  });

  it('should expose a `run` method', () => {
    expect(module.run).to.be.a('function');
  });

  it('should not crash with no scheduled events', () => {
    module.serverless.service.functions = {
      http1: {
        handler: 'handler.js',
        events: [{
          http: {
            method: 'get',
            path: 'test/path'
          }
        }]
      }
    };

    const funcs = module._getFuncConfigs();
    expect(funcs).to.have.lengthOf(0);
  });

  it('should parse cron from cron event expression', () => {
    let result = module._convertScheduleToCron('cron(1/* * * * *)');
    expect(result).to.eql('1/* * * * *');

    result = module._convertScheduleToCron('cron(15 10 ? * 6L 2002-2005)');
    expect(result).to.eql('15 10 ? * 6L 2002-2005');
  });

  it('should parse cron from rate event expression', () => {
    const toCron = (s) => module._convertScheduleToCron(s);

    expect(toCron('rate(5 minutes)')).to.eql('*/5 * * * *');
    expect(toCron('rate(2 minute)')).to.eql('*/2 * * * *');

    expect(toCron('rate(1 hours)')).to.eql('0 */1 * * *');
    expect(toCron('rate(6 hour)')).to.eql('0 */6 * * *');

    expect(toCron('rate(3 day)')).to.eql('0 0 */3 * *');
    expect(toCron('rate(9 days)')).to.eql('0 0 */9 * *');

    expect(toCron('rate(7 year)')).to.be.null;
    expect(toCron('rate(3 lightyears)')).to.be.null;
    expect(toCron('rate(9 seconds)')).to.be.null
  });

  it('should return null if invalid event expression', () => {
    let result = module._convertScheduleToCron('cronic(1/* * * * *)');
    expect(result).to.be.null;
  });

  it('should load functions with schedule events', () => {
    module.serverless.service.functions = {
      scheduled1: {
        handler: 'handler.js',
        events: [{
          schedule: 'cron(1/* * * * *)'
        }]
      },
      http: {
        handler: 'handler.js',
        events: [{
          http: { method: 'get', path: 'path/123' }
        }]
      }
    };

    const funcs = module._getFuncConfigs();

    expect(funcs).to.have.lengthOf(1);
    expect(funcs[0]).to.have.property('id').that.equals('scheduled1');
  });
  //
  // it('should set `webpackConfig` in the context to `custom.webpack` option', () => {
  //   const testConfig = {
  //     entry: 'test',
  //     context: 'testcontext',
  //     output: {},
  //   };
  //   module.serverless.service.custom.webpack = testConfig;
  //   return module
  //     .validate()
  //     .then(() => {
  //       expect(module.webpackConfig).to.eql(testConfig);
  //     });
  // });
  //
  // it('should delete the output path', () => {
  //   const testOutPath = 'test';
  //   const testConfig = {
  //     entry: 'test',
  //     context: 'testcontext',
  //     output: {
  //       path: testOutPath,
  //     },
  //   };
  //   module.serverless.service.custom.webpack = testConfig;
  //   return module
  //     .validate()
  //     .then(() => {
  //       expect(fsExtraMock.removeSync).to.have.been.calledWith(testOutPath);
  //     });
  // });
  //
  // it('should override the output path if `out` option is specified', () => {
  //   const testConfig = {
  //     entry: 'test',
  //     context: 'testcontext',
  //     output: {
  //       path: 'originalpath',
  //       filename: 'filename',
  //     },
  //   };
  //   const testServicePath = 'testpath';
  //   const testOptionsOut = 'testdir';
  //   module.options.out = testOptionsOut;
  //   module.serverless.config.servicePath = testServicePath;
  //   module.serverless.service.custom.webpack = testConfig;
  //   return module
  //     .validate()
  //     .then(() => {
  //       expect(module.webpackConfig.output).to.eql({
  //         path: `${testServicePath}/${testOptionsOut}`,
  //         filename: 'filename',
  //       });
  //     });
  // });
  //
  // it('should set a default `webpackConfig.context` if not present', () => {
  //   const testConfig = {
  //     entry: 'test',
  //     output: {},
  //   };
  //   const testServicePath = 'testpath';
  //   module.serverless.config.servicePath = testServicePath;
  //   module.serverless.service.custom.webpack = testConfig;
  //   return module
  //     .validate()
  //     .then(() => {
  //       expect(module.webpackConfig.context).to.equal(testServicePath);
  //     });
  // });
  //
  // describe('default output', () => {
  //   it('should set a default `webpackConfig.output` if not present', () => {
  //     const testEntry = 'testentry';
  //     const testConfig = {
  //       entry: testEntry,
  //     };
  //     const testServicePath = 'testpath';
  //     module.serverless.config.servicePath = testServicePath;
  //     module.serverless.service.custom.webpack = testConfig;
  //     return module
  //       .validate()
  //       .then(() => {
  //         expect(module.webpackConfig.output).to.eql({
  //           libraryTarget: 'commonjs',
  //           path: `${testServicePath}/.webpack`,
  //           filename: testEntry,
  //         });
  //       });
  //   });
  //
  //   it('should set a default `webpackConfig.output.filename` if `entry` is an array', () => {
  //     const testEntry = ['first', 'second', 'last'];
  //     const testConfig = {
  //       entry: testEntry,
  //     };
  //     const testServicePath = 'testpath';
  //     module.serverless.config.servicePath = testServicePath;
  //     module.serverless.service.custom.webpack = testConfig;
  //     return module
  //       .validate()
  //       .then(() => {
  //         expect(module.webpackConfig.output).to.eql({
  //           libraryTarget: 'commonjs',
  //           path: `${testServicePath}/.webpack`,
  //           filename: 'last',
  //         });
  //       });
  //   });
  //
  //   it('should set a default `webpackConfig.output.filename` if `entry` is not defined', () => {
  //     const testConfig = {};
  //     const testServicePath = 'testpath';
  //     module.serverless.config.servicePath = testServicePath;
  //     module.serverless.service.custom.webpack = testConfig;
  //     return module
  //       .validate()
  //       .then(() => {
  //         expect(module.webpackConfig.output).to.eql({
  //           libraryTarget: 'commonjs',
  //           path: `${testServicePath}/.webpack`,
  //           filename: 'handler.js',
  //         });
  //       });
  //   });
  // });
  //
  // describe('config file load', () => {
  //   it('should load a webpack config from file if `custom.webpack` is a string', () => {
  //     const testConfig = 'testconfig'
  //     const testServicePath = 'testpath';
  //     const requiredPath = `${testServicePath}/${testConfig}`;
  //     module.serverless.config.servicePath = testServicePath;
  //     module.serverless.service.custom.webpack = testConfig;
  //     serverless.utils.fileExistsSync = sinon.stub().returns(true);
  //     const loadedConfig = {
  //       entry: 'testentry',
  //     };
  //     mockery.registerMock(requiredPath, loadedConfig);
  //     return module
  //       .validate()
  //       .then(() => {
  //         expect(serverless.utils.fileExistsSync).to.have.been.calledWith(requiredPath);
  //         expect(module.webpackConfig).to.eql(loadedConfig);
  //         mockery.deregisterMock(requiredPath);
  //       });
  //   });
  //
  //   it('should throw if providing an invalid file', () => {
  //     const testConfig = 'testconfig'
  //     const testServicePath = 'testpath';
  //     const requiredPath = `${testServicePath}/${testConfig}`;
  //     module.serverless.config.servicePath = testServicePath;
  //     module.serverless.service.custom.webpack = testConfig;
  //     serverless.utils.fileExistsSync = sinon.stub().returns(false);
  //     const loadedConfig = {
  //       entry: 'testentry',
  //     };
  //     expect(module.validate.bind(module)).to.throw(/could not find/);
  //   });
  //
  //   it('should load a default file if no custom config is provided', () => {
  //     const testConfig = 'webpack.config.js';
  //     const testServicePath = 'testpath';
  //     const requiredPath = `${testServicePath}/${testConfig}`;
  //     module.serverless.config.servicePath = testServicePath;
  //     serverless.utils.fileExistsSync = sinon.stub().returns(true);
  //     const loadedConfig = {
  //       entry: 'testentry',
  //     };
  //     mockery.registerMock(requiredPath, loadedConfig);
  //     return module
  //       .validate()
  //       .then(() => {
  //         expect(serverless.utils.fileExistsSync).to.have.been.calledWith(requiredPath);
  //         expect(module.webpackConfig).to.eql(loadedConfig);
  //         mockery.deregisterMock(requiredPath);
  //       });
  //   });
  // });
});
