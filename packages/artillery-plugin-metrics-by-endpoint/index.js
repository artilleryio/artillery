/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const url = require('url');

module.exports = { Plugin: MetricsByEndpoint };

const debug = require('debug')('plugin:metrics-by-endpoint');

let useOnlyRequestNames;
let stripQueryString;
let ignoreUnnamedRequests;
let metricsPrefix;

// NOTE: Will not work with `parallel` - need request UIDs for that
function MetricsByEndpoint(script, events) {
  // if(!global.artillery || !global.artillery.log) {
  //   console.error('artillery-plugin-metrics-endpoint requires Artillery v2');
  //   return;
  // }

  // If running in Artillery v2, the plugin should only load in workers
  if (global.artillery &&
      Number(global.artillery.version.slice(0, 1)) > 1 &&
      typeof process.env.LOCAL_WORKER_ID === 'undefined') {
    debug('Not running in a worker, exiting');
    return;
  }

  if (!script.config.processor) {
    script.config.processor = {};
  }

  useOnlyRequestNames = script.config.plugins['metrics-by-endpoint'].useOnlyRequestNames || false;
  stripQueryString = script.config.plugins['metrics-by-endpoint'].stripQueryString || false;
  ignoreUnnamedRequests = script.config.plugins['metrics-by-endpoint'].ignoreUnnamedRequests || false;
  metricsPrefix = script.config.plugins['metrics-by-endpoint'].metricsNamespace || 'plugins.metrics-by-endpoint';

  script.config.processor.metricsByEndpoint_afterResponse = metricsByEndpoint_afterResponse;

  script.scenarios.forEach(function(scenario) {
    scenario.afterResponse = [].concat(scenario.afterResponse || []);
    scenario.afterResponse.push('metricsByEndpoint_afterResponse');
  });
}

function metricsByEndpoint_afterResponse(req, res, userContext, events, done) {
  const targetUrl = userContext.vars.target && url.parse(userContext.vars.target);
  const requestUrl = url.parse(req.url);

  let baseUrl = '';
  if (targetUrl && requestUrl.hostname && targetUrl.hostname !== requestUrl.hostname) {
    baseUrl += requestUrl.hostname
  }
  if (targetUrl && requestUrl.port && targetUrl.port !== requestUrl.port) {
    baseUrl += `:${requestUrl.port}`
  }
  baseUrl += stripQueryString ? requestUrl.pathname : requestUrl.path;

  let reqName = '';
  if (useOnlyRequestNames && req.name) {
    reqName += req.name;
  } else if (req.name) {
    reqName += `${baseUrl} (${req.name})`;
  } else if(!ignoreUnnamedRequests) {
    reqName += baseUrl;
  }

  if (reqName === '') {
    return done()
  }

  const histoName = `${metricsPrefix}.response_time.${reqName}`;

  if (res.headers['server-timing']) {
    const timing = getServerTimingTotal(res.headers['server-timing']);
    events.emit('histogram', `${metricsPrefix}.server-timing.${reqName}`, timing);
  }

  events.emit('counter', `${metricsPrefix}.${reqName}.codes.${res.statusCode}`, 1);
  events.emit('histogram', histoName, res.timings.phases.firstByte);
  return done();
}

function getServerTimingTotal(s) {
  const matches = s.match(/total;dur=[0-9.]+/ig);
  if(matches !== null && matches.length > 0) {
    // we always grab the first instance of "total" if there's more than one
    return Number(matches[0].split('=')[1] || 0);
  } else {
    // no match
    return -1;
  }
}
