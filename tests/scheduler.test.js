"use strict";
/* eslint-env mocha */

const childProcess = require("child_process");
const Serverless = require("serverless");
const Scheduler = require("../lib/scheduler");

const MS_PER_SEC = 1000;

jest.mock("child_process");

describe("validate", () => {
  let module;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.cli = {
      log: () => { }
    };
    module = new Scheduler(serverless);
    jest.clearAllMocks();
  });

  it("should expose a `run` method", () => {
    expect(typeof module.run).toEqual("function");
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
    expect(funcs).toHaveLength(0);
  });

  it("should parse cron from cron event expression", () => {
    let result = module._convertExpressionToCron("cron(1/* * * * *)");
    expect(result).toEqual("1/* * * * *");

    result = module._convertExpressionToCron("cron(15 10 ? * 6L 2002-2005)");
    expect(result).toEqual("15 10 ? * 6L");
  });

  it("should parse cron from object syntax", () => {
    const toCron = (s) => module._parseScheduleObject("my-job", s);
    const result = toCron({ rate: "rate(10 minutes)", enabled: true });
    expect(result).toEqual(
      expect.objectContaining({
        name: "my-job",
        ruleName: "my-job",
        cron: "*/10 * * * *",
        enabled: true,
        input: expect.objectContaining({
          account: "123456789012",
          detail: {},
          "detail-type": "Scheduled Event",
          isOffline: true,
          region: "serverless-offline",
          resources: [
            "arn:aws:events:serverless-offline:123456789012:rule/my-job"
          ],
          source: "aws.events",
          stageVariables: undefined
        })
      })
    );
  });

  it("should parse cron from rate event expression", () => {
    const toCron = (s) => module._convertExpressionToCron(s);

    expect(toCron("rate(5 minutes)")).toEqual("*/5 * * * *");
    expect(toCron("rate(2 minute)")).toEqual("*/2 * * * *");

    expect(toCron("rate(1 hours)")).toEqual("0 */1 * * *");
    expect(toCron("rate(6 hour)")).toEqual("0 */6 * * *");

    expect(toCron("rate(3 day)")).toEqual("0 0 */3 * *");
    expect(toCron("rate(9 days)")).toEqual("0 0 */9 * *");

    expect(toCron("rate(7 year)")).toEqual(null);
    expect(toCron("rate(3 lightyears)")).toEqual(null);
    expect(toCron("rate(9 seconds)")).toEqual(null);
  });

  it("should return null if invalid event expression", () => {
    const result = module._convertExpressionToCron("cronic(1/* * * * *)");
    expect(result).toEqual(null);
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
    expect(funcs).toHaveLength(expectedLength);
    expect(funcs[0].id).toEqual("scheduled1");
    expect(Array.isArray(funcs[0].events)).toEqual(true);

    const event1 = funcs[0].events[0];
    expect(event1.name).toEqual("scheduled1");
    expect(event1.enabled).toEqual(true);
    expect(event1.cron).toEqual("1/* * * * *");

    expect(funcs[1].events).toHaveLength(expectedLength);

    const event2 = funcs[1].events[0];
    expect(event2.name).toEqual("scheduled2");
    expect(event2.enabled).toEqual(false);
    expect(event2.cron).toEqual("0 */2 * * *");
    expect(event2.ruleName).toEqual("custom-name");

    const event3 = funcs[1].events[1];
    expect(event3.name).toEqual("scheduled2");
    expect(event3.enabled).toEqual(true);
    expect(event3.cron).toEqual("1/* * * * *");
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

    expect(funcs[0].id).toEqual("scheduled1");
    expect(Array.isArray(funcs[0].events)).toEqual(true);

    expect(funcs[0].events).toHaveLength(1);

    const event = funcs[0].events[0];
    expect(event.cron).toEqual("1/* * * * *");
    expect(event.input).toBeDefined();
    expect(event.input.key1).toEqual("value1");
  });

  it("should run function with schedule events and inputf", () => {
    module.serverless.service.functions = {
      scheduled1: {
        handler: "handler.test1",
        events: [{
          schedule: {
            rate: "cron(1/* * * * *)",
            input: {
              key1: "value1"
            }
          }
        }]
      }
    };

    const funcs = module._getFuncConfigs();

    expect(funcs[0].id).toEqual("scheduled1");
    expect(Array.isArray(funcs[0].events)).toEqual(true);
    expect(funcs[0].events).toHaveLength(1);

    const event = funcs[0].events[0];
    module._executeFunction(funcs[0].id, event.input);

    expect(event.cron).toEqual("1/* * * * *");
    expect(event.input.key1).toEqual("value1");
    expect(childProcess.execFileSync).toBeCalledWith(
      process.argv[0],
      [
        process.argv[1],
        "invoke",
        "local",
        "--function",
        funcs[0].id,
        "--data",
        JSON.stringify(event.input),
      ],
      {cwd: "./", stdio: "inherit" }
    );
  });

  it("should run function with schedule events, input, and cli options", () => {
    module.serverless.service.functions = {
      scheduled1: {
        handler: "handler.test1",
        events: [{
          schedule: {
            rate: "cron(1/* * * * *)",
            input: {
              key1: "value1"
            }
          }
        }]
      }
    };
    module.serverless.processedInput = {
      options: {
        option1: "value2"
      }
    };

    const funcs = module._getFuncConfigs();

    expect(funcs[0].id).toEqual("scheduled1");
    expect(Array.isArray(funcs[0].events)).toEqual(true);
    expect(funcs[0].events).toHaveLength(1);

    const event = funcs[0].events[0];
    module._executeFunction(funcs[0].id, event.input);

    expect(event.cron).toEqual("1/* * * * *");
    expect(event.input.key1).toEqual("value1");
    expect(childProcess.execFileSync).toBeCalledWith(
      process.argv[0],
      [
        process.argv[1],
        "invoke",
        "local",
        "--function",
        funcs[0].id,
        "--data",
        JSON.stringify(event.input),
        "--option1",
        "value2"
      ],
      {cwd: "./", stdio: "inherit" }
    );
  });

  it("should run function with schedule events, no input", () => {
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

    expect(funcs[0].id).toEqual("scheduled1");
    expect(Array.isArray(funcs[0].events)).toEqual(true);
    expect(funcs[0].events).toHaveLength(1);

    const event = funcs[0].events[0];
    module._executeFunction(funcs[0].id, event.input);

    expect(event.cron).toEqual("1/* * * * *");
    expect(childProcess.execFileSync).toBeCalledWith(
      process.argv[0],
      [
        process.argv[1],
        "invoke",
        "local",
        "--function",
        funcs[0].id,
        "--data",
        JSON.stringify(event.input)
      ],
      { cwd: "./", stdio: "inherit" }
    );
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
    expect(context.getRemainingTimeInMillis()).toBeLessThanOrEqual(timeout * MS_PER_SEC);
    expect(context.getRemainingTimeInMillis()).toBeGreaterThan(timeout * MS_PER_SEC - maxDuration);
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
    expect(context.getRemainingTimeInMillis()).toBeLessThanOrEqual(timeout * MS_PER_SEC);
    expect(context.getRemainingTimeInMillis()).toBeGreaterThan(timeout * MS_PER_SEC - maxDuration);
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
    expect(context.getRemainingTimeInMillis()).toBeLessThanOrEqual(timeout * MS_PER_SEC);
    expect(context.getRemainingTimeInMillis()).toBeGreaterThan(timeout * MS_PER_SEC - maxDuration);
  });
});
