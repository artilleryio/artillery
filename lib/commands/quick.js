'use strict';

const run = require('./run');
const parse = require('url').parse;
const fs = require('fs');
const _ = require('lodash');
const defaultOptions = require('rc')('artillery');

module.exports = quick;

function quick(url, options) {
  let script = {
    config: {
      target: '',
      phases: [
      ],
      mode: 'uniform'
    },
    scenarios: [
      {
        flow: [

        ]
      }
    ]
  };

  options = _.defaultsDeep(options, defaultOptions);

  let p = parse(url);
  let target = p.protocol + '//' + p.host;
  script.config.target = target;

  if (options.insecure && p.protocol.match(/https/)) {
    script.config.tls = {
      rejectUnauthorized: false
    };
  }

  script.config.phases.push({
    duration: options.duration || 60,
    arrivalRate: options.rate || 20
  });

  let requestSpec = {};
  if (options.payload && p.protocol.match(/http/)) {
    requestSpec.post = {
      url: url,
      headers: {'Content-Type': options.t || 'application/json'},
      body: options.payload || ''
    };
  } else if (options.payload && p.protocol.match(/ws/)) {
    requestSpec.send = options.payload;
  } else if (p.protocol.match(/http/)) {
    requestSpec.get = {url: url};
  } else if (p.protocol.match(/ws/)) {
    requestSpec.send = 'hello from Artillery';
  } else {
    throw new Error('Unknown protocol');
  }

  script.scenarios[0].flow.push(requestSpec);
  if (p.protocol.match(/ws/)) {
    script.scenarios[0].engine = 'ws';
  }

  let tmpfn = '/tmp/artillery_quick_script_' +
    (new Date().toISOString()
      .replace(/-/g, '')
      .replace(/T/, '_')
      .replace(/:/g, '')
      .split('.')[0]) +
    '.json';

  fs.writeFileSync(tmpfn, JSON.stringify(script, null, 2), {flag: 'w'});

  run(tmpfn, {quiet: options.quiet});
}
