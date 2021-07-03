/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('plugin:expect');
const urlparse = require('url').parse;
const chalk = require('chalk');
const _ = require('lodash');

const EXPECTATIONS = require('./lib/expectations');
const FORMATTERS = require('./lib/formatters');
const REPORTERS = require('./lib/reporters');

module.exports.Plugin = ExpectationsPlugin;

function ExpectationsPlugin(script, events) {
  this.script = script;
  this.events = events;

  if (!script.config.processor) {
    script.config.processor = {};
  }

  script.scenarios.forEach(function(scenario) {
    scenario.onError = [].concat(scenario.onError || []);
    scenario.onError.push('expectationsPluginOnError');

    scenario.afterResponse = [].concat(scenario.afterResponse || []);
    scenario.afterResponse.push('expectationsPluginCheckExpectations');

    scenario.beforeScenario = [].concat(scenario.beforeScenario || []);
    scenario.beforeScenario.push('expectationsPluginSetExpectOptions');

    scenario.afterScenario = [].concat(scenario.afterScenario || []);
    scenario.afterScenario.push('expectationsPluginMaybeFlushDatadog');
  });

  script.config.processor.expectationsPluginCheckExpectations = expectationsPluginCheckExpectations;
  script.config.processor.expectationsPluginOnError = expectationsPluginOnError;

  script.config.processor.expectationsPluginSetExpectOptions = function(
    userContext,
    events,
    done
  ) {
    userContext.expectationsPlugin = {};
    userContext.expectationsPlugin.outputFormat =
      script.config.plugins.expect.outputFormat || 'pretty';
    if (script.config.plugins.expect.externalReporting) {
      // Datadog-only right now
      userContext.expectationsPlugin.reporter = 'datadog';
      const reportingConfig = script.config.plugins.expect.externalReporting;
      userContext.expectationsPlugin.datadog = metrics.init({
        host: reportingConfig.host || 'artillery-expectations',
        prefix: reportingConfig.prefix,
        flushIntervalSeconds: 5,
        defaultTags: reportingConfig.tags
      });
    }
    return done();
  };

  debug('Initialized');
}

function expectationsPluginOnError(scenarioErr, requestParams, userContext, events, done) {
  if (userContext.expectationsPlugin.outputFormat === 'json') {
    console.log(JSON.stringify({ ok: false, error: scenarioErr.message }));
  } else {
    console.log(chalk.red('Error:'), scenarioErr.message);
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

  const expectations = _.isArray(req.expect) ?
        req.expect :
        _.map(req.expect, (v, k) => { const o = {}; o[k] = v; return o; });

  const results = [];

  let body = maybeParseBody(res);

  _.each(expectations, ex => {
    const checker = Object.keys(ex)[0];
    debug(`checker: ${checker}`);
    let result = EXPECTATIONS[checker].call(
      this,
      ex,
      body,
      req,
      res,
      userContext
    );
    results.push(result);
  });

  userContext.expectations = [].concat(userContext.expectations || []);
  const requestExpectations = {
    name: req.name,
    url: urlparse(req.url).path,
    results: results
  };
  userContext.expectations.push(requestExpectations);

  FORMATTERS[userContext.expectationsPlugin.outputFormat].call(
    this,
    requestExpectations,
    req,
    res,
    userContext
  );

  if (userContext.expectationsPlugin.reporter) {
    REPORTERS[userContext.expectationsPlugin.reporter].call(
      this,
      requestExpectations,
      req,
      res,
      userContext
    );
  }

  const failedExpectations = results.filter(res => !res.ok).length > 0;

  if (failedExpectations) {
    if (global.artillery) {
      global.artillery.suggestedExitCode = 1;
    }
    return done(new Error(`Failed expectations for request ${req.url}`));
  } else {
    return done();
  }
}

function expectationsPluginMaybeFlushDatadog(userContext, events, done) {
  if (
    userContext.expectationsPlugin &&
      userContext.expectationsPlugin.datadog
  ) {
    userContext.expectationsPlugin.datadog.flush(
      () => {
        return done();
      },
      () => {
        return done();
      }
    );
  }
}

function maybeParseBody(res) {
  let body;
  if (
    typeof res.body === 'string' &&
    res.headers['content-type'] &&
    (
      res.headers['content-type'].indexOf('application/json') !== -1 ||
      res.headers['content-type'].indexOf('application/problem+json') !== -1
    )
  ) {
    try {
      body = JSON.parse(res.body);
    } catch (err) {
      body = null;
    }

    return body;
  } else {
    return res.body;
  }
}
