const { test, beforeEach } = require('tap');
const { Plugin } = require('../index');
const { EventEmitter } = require('events');

const baseScript = {
  config: {
    plugins: {
      'metrics-by-endpoint': {}
    }
  },
  scenarios: [
    {
      flow: [
        {
          get: {
            url: '/dino'
          },
          post: {
            url: '/rabbit'
          }
        }
      ]
    },
    {
      flow: [
        {
          get: {
            url: '/potato'
          }
        }
      ]
    }
  ]
};

test('afterResponse', async (t) => {
  let defaultPluginPrefix = 'plugins.metrics-by-endpoint';
  let script;
  let hookArgs;
  let results;

  t.beforeEach(() => {
    script = baseScript;
    global.artillery = {
      version: '2.0.3'
    };
    process.env.LOCAL_WORKER_ID = 'abc123';
    results = {
      counters: [],
      histograms: [],
      calledDone: false
    };

    const eventStub = new EventEmitter();
    eventStub.on('counter', (name, value) => {
      results.counters.push({ name, value });
    });

    eventStub.on('histogram', (name, value) => {
      results.histograms.push({ name, value });
    });

    hookArgs = {
      req: {
        url: '/dino'
      },
      res: {
        statusCode: 203,
        headers: {},
        timings: {
          phases: {
            firstByte: 107
          }
        }
      },
      userContext: {
        vars: {
          target: 'http://example.com'
        }
      },
      events: eventStub,
      done: () => {
        results.calledDone = true;
      }
    };
  });

  t.test('sets up afterResponse hook correctly', async (t) => {
    new Plugin(script, hookArgs.events);

    // check afterResponse is in processor
    t.hasProp(script.config.processor, 'metricsByEndpoint_afterResponse');

    // check afterResponse is each scenario
    script.scenarios.forEach((scenario) => {
      t.equal(scenario.afterResponse.length, 1);
      t.equal(scenario.afterResponse[0], 'metricsByEndpoint_afterResponse');
    });
  });

  t.test('only runs plugin inside workers', async (t) => {
    delete process.env.LOCAL_WORKER_ID;
    script.config.processor = {};
    new Plugin(script, hookArgs.events);

    t.equal(Object.keys(script.config.processor).length, 0);
  });

  t.test(
    'emits counter and histogram metrics correctly with basic configuration',
    async (t) => {
      new Plugin(script, hookArgs.events);

      script.config.processor.metricsByEndpoint_afterResponse(
        hookArgs.req,
        hookArgs.res,
        hookArgs.userContext,
        hookArgs.events,
        hookArgs.done
      );

      t.equal(
        results.counters[0].name,
        `${defaultPluginPrefix}./dino.codes.203`
      );
      t.equal(results.counters[0].value, 1);

      t.equal(
        results.histograms[0].name,
        `${defaultPluginPrefix}.response_time./dino`
      );
      t.equal(
        results.histograms[0].value,
        hookArgs.res.timings.phases.firstByte
      );

      t.equal(results.calledDone, true);
    }
  );

  t.test(
    'uses request url hostname over target hostname if they differ',
    async (t) => {
      const requestUrlWithoutProtocol = 'www.artillery.io/docs';
      hookArgs.req.url = `http://${requestUrlWithoutProtocol}`;
      new Plugin(script, hookArgs.events);

      script.config.processor.metricsByEndpoint_afterResponse(
        hookArgs.req,
        hookArgs.res,
        hookArgs.userContext,
        hookArgs.events,
        hookArgs.done
      );

      t.equal(
        results.counters[0].name,
        `${defaultPluginPrefix}.${requestUrlWithoutProtocol}.codes.203`
      );
      t.equal(results.counters[0].value, 1);

      t.equal(
        results.histograms[0].name,
        `${defaultPluginPrefix}.response_time.${requestUrlWithoutProtocol}`
      );
      t.equal(
        results.histograms[0].value,
        hookArgs.res.timings.phases.firstByte
      );

      t.equal(results.calledDone, true);
    }
  );

  t.test('uses request url port over target port if they differ', async (t) => {
    const pathWithPort = ':8081/dino';
    const requestWithPort = `${hookArgs.userContext.vars.target}${pathWithPort}`;
    hookArgs.req.url = requestWithPort;
    new Plugin(script, hookArgs.events);

    script.config.processor.metricsByEndpoint_afterResponse(
      hookArgs.req,
      hookArgs.res,
      hookArgs.userContext,
      hookArgs.events,
      hookArgs.done
    );

    t.equal(
      results.counters[0].name,
      `${defaultPluginPrefix}.${pathWithPort}.codes.203`
    );
    t.equal(results.counters[0].value, 1);

    t.equal(
      results.histograms[0].name,
      `${defaultPluginPrefix}.response_time.${pathWithPort}`
    );
    t.equal(results.histograms[0].value, hookArgs.res.timings.phases.firstByte);

    t.equal(results.calledDone, true);
  });

  t.test('emits histogram metrics correctly with server-timing', async (t) => {
    new Plugin(script, hookArgs.events);

    const serverTiming = 105;
    hookArgs.res.headers['server-timing'] = `total;dur=${serverTiming}`;

    script.config.processor.metricsByEndpoint_afterResponse(
      hookArgs.req,
      hookArgs.res,
      hookArgs.userContext,
      hookArgs.events,
      hookArgs.done
    );

    t.equal(
      results.histograms[0].name,
      `${defaultPluginPrefix}.server-timing./dino`
    );
    t.equal(results.histograms[0].value, serverTiming);
    t.equal(
      results.histograms[1].name,
      `${defaultPluginPrefix}.response_time./dino`
    );
    t.equal(results.histograms[1].value, hookArgs.res.timings.phases.firstByte);

    t.equal(results.calledDone, true);
  });

  t.test(
    'sets server timing to -1 if server timing header does not match correctly',
    async (t) => {
      new Plugin(script, hookArgs.events);

      const serverTiming = 105;
      hookArgs.res.headers['server-timing'] = `total;potatoes=${serverTiming}`;

      script.config.processor.metricsByEndpoint_afterResponse(
        hookArgs.req,
        hookArgs.res,
        hookArgs.userContext,
        hookArgs.events,
        hookArgs.done
      );

      t.equal(
        results.histograms[0].name,
        `${defaultPluginPrefix}.server-timing./dino`
      );
      t.equal(results.histograms[0].value, -1);
      t.equal(
        results.histograms[1].name,
        `${defaultPluginPrefix}.response_time./dino`
      );
      t.equal(
        results.histograms[1].value,
        hookArgs.res.timings.phases.firstByte
      );

      t.equal(results.calledDone, true);
    }
  );

  t.test('includes req name in metric name if req.name is set', async (t) => {
    new Plugin(script, hookArgs.events);

    const reqName = 'bunnyRequest123';
    hookArgs.req.name = reqName;

    script.config.processor.metricsByEndpoint_afterResponse(
      hookArgs.req,
      hookArgs.res,
      hookArgs.userContext,
      hookArgs.events,
      hookArgs.done
    );

    t.equal(
      results.counters[0].name,
      `${defaultPluginPrefix}./dino (${reqName}).codes.203`
    );
    t.equal(results.counters[0].value, 1);

    t.equal(
      results.histograms[0].name,
      `${defaultPluginPrefix}.response_time./dino (${reqName})`
    );
    t.equal(results.histograms[0].value, hookArgs.res.timings.phases.firstByte);
  });

  t.test(
    'uses req name if req.name and useOnlyRequestNames are set',
    async (t) => {
      script.config.plugins['metrics-by-endpoint'] = {
        useOnlyRequestNames: true
      };
      new Plugin(script, hookArgs.events);

      const reqName = 'bunnyRequest123';
      hookArgs.req.name = reqName;

      script.config.processor.metricsByEndpoint_afterResponse(
        hookArgs.req,
        hookArgs.res,
        hookArgs.userContext,
        hookArgs.events,
        hookArgs.done
      );

      t.equal(
        results.counters[0].name,
        `${defaultPluginPrefix}.${reqName}.codes.203`
      );
      t.equal(results.counters[0].value, 1);

      t.equal(
        results.histograms[0].name,
        `${defaultPluginPrefix}.response_time.${reqName}`
      );
      t.equal(
        results.histograms[0].value,
        hookArgs.res.timings.phases.firstByte
      );
    }
  );

  t.test(
    'overrides default prefix if metricsNamespace option is set',
    async (t) => {
      const metricsNamespace = 'my-metrics';
      script.config.plugins['metrics-by-endpoint'] = {
        metricsNamespace
      };
      new Plugin(script, hookArgs.events);

      script.config.processor.metricsByEndpoint_afterResponse(
        hookArgs.req,
        hookArgs.res,
        hookArgs.userContext,
        hookArgs.events,
        hookArgs.done
      );

      t.equal(results.counters[0].name, `${metricsNamespace}./dino.codes.203`);
      t.equal(results.counters[0].value, 1);

      t.equal(
        results.histograms[0].name,
        `${metricsNamespace}.response_time./dino`
      );
      t.equal(
        results.histograms[0].value,
        hookArgs.res.timings.phases.firstByte
      );
    }
  );

  t.test(
    'no metrics are emitted if ignoreUnnamedRequests is set and no name is set',
    async (t) => {
      script.config.plugins['metrics-by-endpoint'] = {
        ignoreUnnamedRequests: true
      };
      new Plugin(script, hookArgs.events);

      script.config.processor.metricsByEndpoint_afterResponse(
        hookArgs.req,
        hookArgs.res,
        hookArgs.userContext,
        hookArgs.events,
        hookArgs.done
      );

      t.equal(results.counters.length, 0);
      t.equal(results.histograms.length, 0);
    }
  );

  t.test(
    'metrics are emitted if ignoreUnnamedRequests is set and name is set',
    async (t) => {
      script.config.plugins['metrics-by-endpoint'] = {
        ignoreUnnamedRequests: true
      };
      hookArgs.req.name = 'iAmNamed';
      new Plugin(script, hookArgs.events);

      script.config.processor.metricsByEndpoint_afterResponse(
        hookArgs.req,
        hookArgs.res,
        hookArgs.userContext,
        hookArgs.events,
        hookArgs.done
      );

      t.equal(
        results.counters[0].name,
        `${defaultPluginPrefix}./dino (${hookArgs.req.name}).codes.203`
      );
      t.equal(results.counters[0].value, 1);

      t.equal(
        results.histograms[0].name,
        `${defaultPluginPrefix}.response_time./dino (${hookArgs.req.name})`
      );
      t.equal(
        results.histograms[0].value,
        hookArgs.res.timings.phases.firstByte
      );
    }
  );

  t.test(
    'strips query string from url when stripQueryString is set',
    async (t) => {
      script.config.plugins['metrics-by-endpoint'] = {
        stripQueryString: true
      };
      hookArgs.req.url = '/dino?query=stringy&another=one';
      new Plugin(script, hookArgs.events);

      script.config.processor.metricsByEndpoint_afterResponse(
        hookArgs.req,
        hookArgs.res,
        hookArgs.userContext,
        hookArgs.events,
        hookArgs.done
      );

      t.equal(
        results.counters[0].name,
        `${defaultPluginPrefix}./dino.codes.203`
      );
      t.equal(results.counters[0].value, 1);

      t.equal(
        results.histograms[0].name,
        `${defaultPluginPrefix}.response_time./dino`
      );
      t.equal(
        results.histograms[0].value,
        hookArgs.res.timings.phases.firstByte
      );
    }
  );
});
