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
      ]
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
  if(options.payload) {
    requestSpec.post = {
      url: url,
      headers: { 'Content-Type': options.t || 'application/json' },
      body: options.payload || ''
    };
  } else {
    requestSpec.get = { url: url};
  }

  script.scenarios[0].flow.push(requestSpec);

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
