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
let groupDynamicURLs;

// NOTE: Will not work with `parallel` - need request UIDs for that
function MetricsByEndpoint(script, events) {
  // if(!global.artillery || !global.artillery.log) {
  //   console.error('artillery-plugin-metrics-endpoint requires Artillery v2');
  //   return;
  // }

  // If running in Artillery v2, the plugin should only load in workers
  if (
    global.artillery &&
    Number(global.artillery.version.slice(0, 1)) > 1 &&
    typeof process.env.LOCAL_WORKER_ID === 'undefined'
  ) {
    debug('Not running in a worker, exiting');
    return;
  }

  if (!script.config.processor) {
    script.config.processor = {};
  }

  useOnlyRequestNames =
    script.config.plugins['metrics-by-endpoint'].useOnlyRequestNames || false;
  stripQueryString =
    script.config.plugins['metrics-by-endpoint'].stripQueryString || false;
  ignoreUnnamedRequests =
    script.config.plugins['metrics-by-endpoint'].ignoreUnnamedRequests || false;
  metricsPrefix =
    script.config.plugins['metrics-by-endpoint'].metricsNamespace ||
    'plugins.metrics-by-endpoint';
  groupDynamicURLs =
    script.config.plugins['metrics-by-endpoint'].groupDynamicURLs ?? true;

  script.config.processor.metricsByEndpoint_afterResponse =
    metricsByEndpoint_afterResponse;
  script.config.processor.metricsByEndpoint_onError = metricsByEndpoint_onError;
  script.config.processor.metricsByEndpoint_beforeRequest =
    metricsByEndpoint_beforeRequest;

  script.scenarios.forEach(function (scenario) {
    scenario.afterResponse = [].concat(scenario.afterResponse || []);
    scenario.afterResponse.push('metricsByEndpoint_afterResponse');
    scenario.onError = [].concat(scenario.onError || []);
    scenario.onError.push('metricsByEndpoint_onError');
    scenario.beforeRequest = [].concat(scenario.beforeRequest || []);
    scenario.beforeRequest.push('metricsByEndpoint_beforeRequest');
  });
}

function calculateBaseUrl(target, originalRequestUrl) {
  const targetUrl = target && url.parse(target);
  const requestUrl = url.parse(originalRequestUrl);

  let baseUrl = '';
  if (
    targetUrl &&
    requestUrl.hostname &&
    targetUrl.hostname !== requestUrl.hostname
  ) {
    baseUrl += requestUrl.hostname;
  }
  if (targetUrl && requestUrl.port && targetUrl.port !== requestUrl.port) {
    baseUrl += `:${requestUrl.port}`;
  }
  baseUrl += stripQueryString ? requestUrl.pathname : requestUrl.path;

  return decodeURIComponent(baseUrl);
}

function getReqName(target, originalRequestUrl, requestName) {
  const baseUrl = calculateBaseUrl(target, originalRequestUrl);

  if (!requestName) {
    return ignoreUnnamedRequests ? '' : baseUrl;
  }

  return useOnlyRequestNames ? requestName : `${baseUrl} (${requestName})`;
}

function metricsByEndpoint_beforeRequest(req, userContext, events, done) {
  if (groupDynamicURLs) {
    req.defaultName = getReqName(userContext.vars.target, req.url, req.name);
  }

  return done();
}

function metricsByEndpoint_onError(err, req, userContext, events, done) {
  //if groupDynamicURLs is true, then req.defaultName is set in beforeRequest
  //otherwise, we must calculate the reqName here as req.url is the non-templated version
  const reqName = groupDynamicURLs
    ? req.defaultName
    : getReqName(userContext.vars.target, req.url, req.name);

  if (reqName === '') {
    return done();
  }

  events.emit(
    'counter',
    `${metricsPrefix}.${reqName}.errors.${err.code || err.name}`,
    1
  );

  done();
}

function metricsByEndpoint_afterResponse(req, res, userContext, events, done) {
  //if groupDynamicURLs is true, then req.defaultName is set in beforeRequest
  //otherwise, we must calculate the reqName here as req.url is the non-templated version
  const reqName = groupDynamicURLs
    ? req.defaultName
    : getReqName(userContext.vars.target, req.url, req.name);

  if (reqName === '') {
    return done();
  }

  const histoName = `${metricsPrefix}.response_time.${reqName}`;

  if (res.headers['server-timing']) {
    const timing = getServerTimingTotal(res.headers['server-timing']);
    events.emit(
      'histogram',
      `${metricsPrefix}.server-timing.${reqName}`,
      timing
    );
  }

  events.emit(
    'counter',
    `${metricsPrefix}.${reqName}.codes.${res.statusCode}`,
    1
  );
  events.emit('histogram', histoName, res.timings.phases.firstByte);
  return done();
}

function getServerTimingTotal(s) {
  const matches = s.match(/total;dur=[0-9.]+/gi);
  if (matches !== null && matches.length > 0) {
    // we always grab the first instance of "total" if there's more than one
    return Number(matches[0].split('=')[1] || 0);
  } else {
    // no match
    return -1;
  }
}
