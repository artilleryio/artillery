'use strict';

var run = require('./run');
var parse = require('url').parse;
var fs = require('fs');

module.exports = quick;

function quick(url, options) {
  var script = {
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

  var p = parse(url);
  var target = p.protocol + '//' + p.host;
  script.config.target = target;

  script.config.phases.push({
    duration: options.duration || 60,
    arrivalRate: options.rate || 20
  });

  var requestSpec = {};
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
    requestSpec.send = 'hello from minigun';
  } else {
    throw new Error('Unknown protocol');
  }

  script.scenarios[0].flow.push(requestSpec);
  if (p.protocol.match(/ws/)) {
    script.scenarios[0].engine = 'ws';
  }

  var tmpfn = '/tmp/minigun_quick_script_' +
    (new Date().toISOString()
      .replace(/-/g, '')
      .replace(/T/, '_')
      .replace(/:/g, '')
      .split('.')[0]) +
    '.json';

  fs.writeFileSync(tmpfn, JSON.stringify(script, null, 2), {flag: 'w'});

  run(tmpfn, {});
}
