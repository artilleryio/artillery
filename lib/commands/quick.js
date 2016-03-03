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

  let tmpf = tmp.fileSync();
  fs.writeFileSync(tmpf.name, JSON.stringify(script, null, 2), {flag: 'w'});
  run(tmpf.name, {quiet: options.quiet});
}
