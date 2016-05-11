/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const run = require('./run');
const parse = require('url').parse;
const fs = require('fs');
const _ = require('lodash');
const defaultOptions = require('rc')('artillery');
const tmp = require('tmp');
const debug = require('debug')('commands:quick');

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

  if (options.c && options.r) {
    console.log('Error: either fixed concurrency or arrivals per second should be set, not both');
    process.exit(1);
  }

  if (options.insecure && p.protocol.match(/https/)) {
    script.config.tls = {
      rejectUnauthorized: false
    };
  }

  if (options.r) {
    script.config.phases.push({
      duration: options.duration || 60,
      arrivalRate: options.rate || 20
    });
  } else if (options.c) {
    script.config.phases.push({
      duration: options.d * 1000 || Math.ceil(options.c / 50),
      arrivalCount: options.c || 1
    });
  } else {
    console.log('Error: either arrival rate or fixed concurrency must be specified');
    process.exit(1);
  }

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

  if (options.n) {
    requestSpec = {
      loop: [ requestSpec ],
      count: options.n
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
