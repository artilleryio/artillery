/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const url = require('url');

module.exports = { Plugin: MetricsByEndpoint };

let useOnlyRequestNames;

// NOTE: Will not work with `parallel` - need request UIDs for that
function MetricsByEndpoint(script, events) {
  if (!script.config.processor) {
    script.config.processor = {};
  }

  useOnlyRequestNames = script.config.plugins["metrics-by-endpoint"].useOnlyRequestNames || false;

  script.config.processor.metricsByEndpoint_beforeRequest = metricsByEndpoint_beforeRequest;
script.config.processor.metricsByEndpoint_afterResponse = metricsByEndpoint_afterResponse;

  script.scenarios.forEach(function(scenario) {
    scenario.beforeRequest = [].concat(scenario.beforeRequest || []);
    scenario.beforeRequest.push('metricsByEndpoint_beforeRequest');
    scenario.afterResponse = [].concat(scenario.afterResponse || []);
    scenario.afterResponse.push('metricsByEndpoint_afterResponse');
  });
}

function metricsByEndpoint_beforeRequest(req, userContext, events, done) {
  userContext.vars._metricsByEndpointStartedAt = Date.now();
  return done();
}

function metricsByEndpoint_afterResponse(req, res, userContext, events, done) {
  let delta = 0;
  // TODO: If hostname is not target, keep it.
  const baseUrl = url.parse(req.url).path;

  let histoName;
  
  if (useOnlyRequestNames && req.name) {
    histoName = req.name;
  } else if (req.name) {
    histoName = `${baseUrl} (${req.name})`;
  } else {
    histoName = baseUrl;
  }

  let counterName = histoName;

  if (res.headers['server-timing']) {
    delta = getServerTimingTotal(res.headers['server-timing']);
    histoName = `Server-Timing ${histoName}`;
  } else {
    delta = Date.now() - userContext.vars._metricsByEndpointStartedAt;
  }

  events.emit('counter', `code ${res.statusCode} on ${counterName}`, 1);
  events.emit('histogram', histoName, delta);
  return done();
}

function getServerTimingTotal(s) {
  const matches = s.match(/total;dur=[0-9.]+/ig);
  if(matches !== null && matches.length > 0) {
    // we always grab the first instance of "total" if there's more than one
    // TODO: Use Number and round to 2 digits
    return parseInt(matches[0]
                    .split('=')[1]);
  } else {
    // no match
    return -1;
  }
}
