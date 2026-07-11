/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { parse as urlparse } from 'node:url';
import chalkModule from 'chalk';

const chalk: any = chalkModule;

import createDebug from 'debug';
import _ from 'lodash';
import * as EXPECTATIONS from './lib/expectations.ts';
import * as FORMATTERS from './lib/formatters.ts';

const debug = createDebug('plugin:expect');

export {
  ExpectationsPlugin as Plugin,
  EXPECTATIONS as expectations,
  FORMATTERS as formatters
};

function ExpectationsPlugin(script, events) {
  if (!global.artillery || !global.artillery.log) {
    console.error('artillery-plugin-expect requires Artillery v2');
    return;
  }

  if (typeof process.env.LOCAL_WORKER_ID === 'undefined') {
    debug('Not running in a worker, exiting');
    return;
  }

  this.script = script;
  this.events = events;

  if (!script.config.processor) {
    script.config.processor = {};
  }
  // In the main thread config.processor may still be an unresolved
  // path (a string). Attaching functions to it was a silent no-op
  // under sloppy mode; ES modules are strict, so guard explicitly.
  // Workers load the processor into an object before plugins run.
  const canAttach = typeof script.config.processor === 'object';

  script.scenarios.forEach((scenario) => {
    scenario.onError = [].concat(scenario.onError || []);
    scenario.onError.push('expectationsPluginOnError');

    scenario.afterResponse = [].concat(scenario.afterResponse || []);
    scenario.afterResponse.push('expectationsPluginCheckExpectations');

    scenario.beforeScenario = [].concat(scenario.beforeScenario || []);
    scenario.beforeScenario.push('expectationsPluginSetExpectOptions');

    scenario.afterScenario = [].concat(scenario.afterScenario || []);
  });

  if (!canAttach) {
    return;
  }

  script.config.processor.expectationsPluginCheckExpectations =
    expectationsPluginCheckExpectations;
  script.config.processor.expectationsPluginOnError = expectationsPluginOnError;

  script.config.processor.expectationsPluginSetExpectOptions = (
    userContext,
    _events,
    done
  ) => {
    userContext.expectationsPlugin = {};
    userContext.expectationsPlugin.formatter =
      script.config.plugins.expect.formatter ||
      script.config.plugins.expect.outputFormat ||
      'pretty';
    userContext.expectationsPlugin.expectDefault200 =
      script.config.plugins.expect.expectDefault200 === true ||
      script.config.plugins.expect.expectDefault200 === 'true';
    userContext.expectationsPlugin.reportFailuresAsErrors =
      script.config.plugins.expect.reportFailuresAsErrors;
    userContext.expectationsPlugin.useOnlyRequestNames =
      script.config.plugins.expect.useOnlyRequestNames === true ||
      script.config.plugins.expect.useOnlyRequestNames === 'true';

    return done();
  };

  debug('Initialized');
}

function expectationsPluginOnError(
  scenarioErr,
  _requestParams,
  userContext,
  _events,
  done
) {
  if (scenarioErr instanceof FailedExpectationError) {
    return done();
  }
  if (userContext.expectationsPlugin.formatter === 'json') {
    artillery.log(JSON.stringify({ ok: false, error: scenarioErr.message }));
  } else {
    artillery.log(`${chalk.red('Error:')} ${scenarioErr.message}`);
  }
  return done();
}

function expectationsPluginCheckExpectations(
  req,
  res,
  userContext,
  events,
  done
) {
  debug('Checking expectations');

  const expectations = _.isArray(req.expect)
    ? req.expect
    : _.map(req.expect, (v, k) => {
        const o = {};
        o[k] = v;
        return o;
      });

  if (expectations.length === 0) {
    if (userContext.expectationsPlugin.expectDefault200) {
      expectations[0] = { statusCode: 200 };
    }
  }

  const results = [];

  const body = maybeParseBody(res);
  _.each(expectations, (ex) => {
    const checker = Object.keys(ex)[0];
    debug(`checker: ${checker}`);

    let result;
    if (EXPECTATIONS[checker]) {
      result = EXPECTATIONS[checker].call(
        this,
        ex,
        body,
        req,
        res,
        userContext
      );
      results.push(result);
    } else {
      console.log(`Expect Plugin: Expectation '${checker}' is not supported`);
    }
  });

  userContext.expectations = [].concat(userContext.expectations || []);
  const requestExpectations = {
    name: req.name,
    url: urlparse(req.url).path,
    results: results
  };
  userContext.expectations.push(requestExpectations);

  requestExpectations.results.forEach((e) => {
    if (e.ok) {
      events.emit('counter', 'plugins.expect.ok', 1);
      events.emit('counter', `plugins.expect.ok.${e.type}`, 1);
    } else {
      events.emit('counter', 'plugins.expect.failed', 1);
      events.emit('counter', `plugins.expect.failed.${e.type}`, 1);
    }
  });

  events.emit(
    'plugin:expect:expectations',
    requestExpectations,
    req,
    res,
    userContext
  );

  const formatterName = userContext.expectationsPlugin.formatter;

  FORMATTERS[formatterName].call(
    this,
    requestExpectations,
    req,
    res,
    userContext
  );

  const failedExpectations = results.filter((res) => !res.ok).length > 0;

  if (!failedExpectations) {
    return done();
  }

  if (global.artillery) {
    global.artillery.suggestedExitCode = 21;
  }

  if (userContext.expectationsPlugin.reportFailuresAsErrors) {
    const filteredRequestName =
      userContext.expectationsPlugin.useOnlyRequestNames && req.name
        ? req.name
        : req.url;
    return done(
      new FailedExpectationError(
        `Failed expectations for request ${filteredRequestName}`
      )
    );
  }

  return done();
}

function maybeParseBody(res) {
  let body;
  if (
    typeof res.body === 'string' &&
    res.headers['content-type'] &&
    (res.headers['content-type'].indexOf('application/json') !== -1 ||
      res.headers['content-type'].indexOf('application/problem+json') !== -1 ||
      res.headers['content-type'].indexOf('application/ld+json') !== -1)
  ) {
    try {
      body = JSON.parse(res.body);
    } catch (_err) {
      body = null;
    }

    return body;
  } else {
    return res.body;
  }
}

class FailedExpectationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FailedExpectationError';
  }
}
