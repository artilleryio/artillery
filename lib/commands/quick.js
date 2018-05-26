/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const run = require('./run');
const parse = require('url').parse;
const fs = require('fs');
const _ = require('lodash');
const tmp = require('tmp');
const debug = require('debug')('commands:quick');

module.exports = quick;

module.exports.getConfig = function(callback) {
  let commandConfig = {
    name: 'quick',
    command: 'quick <target>',
    description: 'Run a quick test without writing a test script',
    options: [
      ['-r, --rate <number>', 'New arrivals per second'],
      ['-c, --count <number>', 'Fixed number of arrivals'],
      ['-d, --duration <seconds>', 'Duration of the arrival phase'],
      ['-n, --num <number>', 'Number of requests each new arrival will send'],
      ['-t, --content-type <string>',
       'Set content-type (defaults to application/json],'],
      ['-p, --payload <path>', 'Set payload file (CSV)'],
      ['-o, --output <path>', 'Set file to write stats to (will output ' +
        'to stdout by default)'],
      ['-k, --insecure', 'Allow insecure TLS connections, e.g. with a self-signed cert'],
      ['-q, --quiet', 'Do not print anything to stdout']
    ]
  };

  if (callback) {
    return callback(null, commandConfig);
  } else {
    return commandConfig;
  }
};

function quick(url, options) {
  var rate = options.r || options.rate;
  var duration = options.d || options.duration;
  var arrivalCount = options.c || options.count;

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

  let p = parse(url);
  let target = p.protocol + '//' + p.host;
  script.config.target = target;

  if (options.count && options.rate) {
    console.log('Error: either a fixed number of arrivals or arrivals per ' +
                'second should be set, not both');
    process.exit(1);
  }

  if (options.insecure && p.protocol.match(/https/)) {
    script.config.tls = {
      rejectUnauthorized: false
    };
  }

  if (options.rate) {
    script.config.phases.push({
      duration: options.duration || 60,
      arrivalRate: options.rate || 20
    });
  } else if (options.count) {
    script.config.phases.push({
      duration: options.duration || Math.ceil(options.count / 50),
      arrivalCount: options.count || 1
    });
  } else {
    console.log('Error: either arrival rate or an arrival count must be ' +
                'specified');
    process.exit(1);
  }

  let requestSpec = {};
  if (options.payload && p.protocol.match(/http/)) {
    requestSpec.post = {
      url: url,
      headers: {'Content-Type': options.contentType || 'application/json'},
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

  if (options.num) {
    requestSpec = {
      loop: [requestSpec],
      count: options.num
    };
  }

  debug('requestSpec: %s', JSON.stringify(requestSpec, null, 2));

  script.scenarios[0].flow.push(requestSpec);
  if (p.protocol.match(/ws/)) {
    script.scenarios[0].engine = 'ws';
  }

  let tmpf = tmp.fileSync();
  fs.writeFileSync(tmpf.name, JSON.stringify(script, null, 2), {flag: 'w'});
  run(tmpf.name, {quiet: options.quiet, output: options.output});
}
