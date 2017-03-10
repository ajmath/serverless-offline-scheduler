"use strict";
/* eslint-env mocha */

const chai = require("chai");
const Serverless = require("serverless");
const expect = chai.expect;

const Scheduler = require("../lib/scheduler");

describe("validate", () => {
  let module;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.cli = {
      log: () => { }
    };
    module = new Scheduler(serverless);
  });

  it("should expose a `run` method", () => {
    expect(module.run).to.be.a("function");
  });

  it("should not crash with no scheduled events", () => {
    module.serverless.service.functions = {
      http1: {
        handler: "handler.js",
        events: [{
          http: {
            method: "get",
            path: "test/path"
          }
        }]
      }
    };

    const funcs = module._getFuncConfigs();
    expect(funcs).to.have.lengthOf(0);
  });

  it("should parse cron from cron event expression", () => {
    let result = module._convertScheduleToCron("cron(1/* * * * *)");
    expect(result).to.eql("1/* * * * *");

    result = module._convertScheduleToCron("cron(15 10 ? * 6L 2002-2005)");
    expect(result).to.eql("15 10 ? * 6L 2002-2005");
  });

  it("should parse cron from rate event expression", () => {
    const toCron = (s) => module._convertScheduleToCron(s);

    expect(toCron("rate(5 minutes)")).to.eql("*/5 * * * *");
    expect(toCron("rate(2 minute)")).to.eql("*/2 * * * *");

    expect(toCron("rate(1 hours)")).to.eql("0 */1 * * *");
    expect(toCron("rate(6 hour)")).to.eql("0 */6 * * *");

    expect(toCron("rate(3 day)")).to.eql("0 0 */3 * *");
    expect(toCron("rate(9 days)")).to.eql("0 0 */9 * *");

    expect(toCron("rate(7 year)")).to.eql(null);
    expect(toCron("rate(3 lightyears)")).to.eql(null);
    expect(toCron("rate(9 seconds)")).to.eql(null);
  });

  it("should return null if invalid event expression", () => {
    const result = module._convertScheduleToCron("cronic(1/* * * * *)");
    expect(result).to.eql(null);
  });

  it("should load functions with schedule events", () => {
    module.serverless.service.functions = {
      scheduled1: {
        handler: "handler.js",
        events: [{
          schedule: "cron(1/* * * * *)"
        }]
      },
      http: {
        handler: "handler.js",
        events: [{
          http: { method: "get", path: "path/123" }
        }]
      }
    };

    const funcs = module._getFuncConfigs();

    expect(funcs).to.have.lengthOf(1);
    expect(funcs[0]).to.have.property("id").that.equals("scheduled1");
  });
});
