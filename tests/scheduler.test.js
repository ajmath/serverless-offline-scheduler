"use strict";
/* eslint-env mocha */

const chai = require("chai");
// const Serverless = require("serverless");
const ServerlessBuilder = require("./support/ServerlessBuilder");
const expect = chai.expect;

const Scheduler = require("../lib/scheduler");

const MS_PER_SEC = 1000;

describe("validate", () => {
  let module;
  let serverless;

  beforeEach(() => {
    serverless = new ServerlessBuilder();
    module = new Scheduler(serverless.toObject());
  });

  it("should expose a `run` method", () => {
    expect(module.run).to.be.a("function");
  });

  it("should not crash with no scheduled events", () => {
    module.serverless.service.functions = {
      http1: {
        handler: "handler.js",
        events: [
          {
            http: {
              method: "get",
              path: "test/path"
            }
          }
        ]
      }
    };

    const funcs = module._getFuncConfigs();
    expect(funcs).to.have.lengthOf(0);
  });

  it("should parse cron from cron event expression", () => {
    let result = module._convertExpressionToCron("cron(1/* * * * *)");
    expect(result).to.eql("1/* * * * *");

    result = module._convertExpressionToCron("cron(15 10 ? * 6L 2002-2005)");
    expect(result).to.eql("15 10 ? * 6L");
  });

  it("should parse cron from object syntax", () => {
    const toCron = (s) => module._parseScheduleObject("my-job", s);

    expect(toCron({ rate: "rate(10 minutes)", enabled: true })).to.eql({
      name: "my-job",
      ruleName: "my-job",
      cron: "*/10 * * * *",
      enabled: true
    });
  });

  it("should parse cron from rate event expression", () => {
    const toCron = (s) => module._convertExpressionToCron(s);

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
    const result = module._convertExpressionToCron("cronic(1/* * * * *)");
    expect(result).to.eql(null);
  });

  it("should load functions with schedule events", () => {
    module.serverless.service.functions = {
      scheduled1: {
        handler: "handler.test1",
        events: [
          {
            schedule: "cron(1/* * * * *)"
          }
        ]
      },
      scheduled2: {
        handler: "handler.test2",
        events: [
          {
            schedule: {
              name: "custom-name",
              rate: "rate(2 hours)",
              enabled: false
            }
          },
          {
            schedule: "cron(1/* * * * *)"
          }
        ]
      },
      http: {
        handler: "handler.web",
        events: [
          {
            http: { method: "get", path: "path/123" }
          }
        ]
      }
    };

    const funcs = module._getFuncConfigs();
    const expectedLength = 2;
    expect(funcs).to.have.lengthOf(expectedLength);
    expect(funcs[0])
      .to.have.property("id")
      .that.equals("scheduled1");
    expect(funcs[0]).to.have.property("events");

    const event1 = funcs[0].events[0];
    expect(event1)
      .to.have.property("name")
      .that.equals("scheduled1");
    expect(event1)
      .to.have.property("enabled")
      .that.equals(true);
    expect(event1)
      .to.have.property("cron")
      .that.equals("1/* * * * *");

    expect(funcs[1].events).to.have.lengthOf(expectedLength);

    const event2 = funcs[1].events[0];
    expect(event2)
      .to.have.property("name")
      .that.equals("scheduled2");
    expect(event2)
      .to.have.property("enabled")
      .that.equals(false);
    expect(event2)
      .to.have.property("cron")
      .that.equals("0 */2 * * *");
    expect(event2)
      .to.have.property("ruleName")
      .that.equals("custom-name");

    const event3 = funcs[1].events[1];
    expect(event3)
      .to.have.property("name")
      .that.equals("scheduled2");
    expect(event3)
      .to.have.property("enabled")
      .that.equals(true);
    expect(event3)
      .to.have.property("cron")
      .that.equals("1/* * * * *");
  });

  it("should load functions with schedule events", () => {
    module.serverless.service.functions = {
      scheduled1: {
        handler: "handler.test1",
        events: [
          {
            schedule: {
              rate: "cron(1/* * * * *)",
              input: {
                key1: "value1"
              }
            }
          }
        ]
      }
    };

    const funcs = module._getFuncConfigs();

    expect(funcs[0])
      .to.have.property("id")
      .that.equals("scheduled1");
    expect(funcs[0]).to.have.property("events");

    expect(funcs[0].events).to.have.lengthOf(1);

    const event = funcs[0].events[0];
    expect(event)
      .to.have.property("cron")
      .that.equals("1/* * * * *");
    expect(event).to.have.property("input");
    expect(event.input)
      .to.have.property("key1")
      .that.equals("value1");
  });

  it("should use the *function* timeout for getRemainingTimeInMillis", () => {
    const timeout = 45; // secs
    const maxDuration = 2; // msecs

    module.serverless.service.functions = {
      scheduled1: {
        handler: "handler.test1",
        timeout,
        events: [
          {
            schedule: {
              rate: "cron(1/* * * * *)"
            }
          }
        ]
      }
    };

    const funcs = module._getFuncConfigs();
    const context = module._getContext(funcs[0]);
    expect(context.getRemainingTimeInMillis()).to.be.at.most(timeout * MS_PER_SEC);
    expect(context.getRemainingTimeInMillis()).to.be.at.least(timeout * MS_PER_SEC - maxDuration);
  });

  it("should use the *provider* timeout for getRemainingTimeInMillis", () => {
    const timeout = 35; // secs
    const maxDuration = 2; // msecs

    module.serverless.service.provider.timeout = timeout;
    module.serverless.service.functions = {
      scheduled1: {
        handler: "handler.test1",
        events: [
          {
            schedule: {
              rate: "cron(1/* * * * *)"
            }
          }
        ]
      }
    };

    const funcs = module._getFuncConfigs();
    const context = module._getContext(funcs[0]);
    expect(context.getRemainingTimeInMillis()).to.be.at.most(timeout * MS_PER_SEC);
    expect(context.getRemainingTimeInMillis()).to.be.at.least(timeout * MS_PER_SEC - maxDuration);
  });

  it("should use the *default* timeout for getRemainingTimeInMillis", () => {
    const timeout = 6; // secs
    const maxDuration = 2; // msecs

    module.serverless.service.functions = {
      scheduled1: {
        handler: "handler.test1",
        events: [
          {
            schedule: {
              rate: "cron(1/* * * * *)"
            }
          }
        ]
      }
    };

    const funcs = module._getFuncConfigs();
    const context = module._getContext(funcs[0]);
    expect(context.getRemainingTimeInMillis()).to.be.at.most(timeout * MS_PER_SEC);
    expect(context.getRemainingTimeInMillis()).to.be.at.least(timeout * MS_PER_SEC - maxDuration);
  });
});
