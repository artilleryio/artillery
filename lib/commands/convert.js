/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const YAML = require('js-yaml');
const fs = require('fs');
const path = require('path');

module.exports = convert;

module.exports.getConfig = function(callback) {
  let commandConfig = {
    name: 'convert',
    command: 'convert <file>',
    description: 'Convert JSON to YAML and vice versa',
    options: [
    ]
  };

  if (callback) {
    return callback(null, commandConfig);
  } else {
    return commandConfig;
  }
};


function convert(filename) {
  let contents = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('json')) {
    let json = JSON.parse(contents);
    let yaml = YAML.safeDump(json, {
      indent: 4,
      lineWidth: 100,
      noRefs: true
    });
    let newFilename = path.basename(filename, '.json') + '.yml';
    if (!fs.existsSync(newFilename)) {
      fs.writeFileSync(newFilename, yaml, 'utf8');
    } else {
      console.log(`File ${newFilename} already exists, not overwriting`);
      process.exit(1);
    }
  } else if (filename.endsWith('yml') || filename.endsWith('yaml')) {
    let yaml = YAML.safeLoad(contents);
    let json = JSON.stringify(yaml, null, 2);
    let newFilename = path.basename(filename, '.yml') + '.json';
    if (!fs.existsSync(newFilename)) {
      fs.writeFileSync(newFilename, json, 'utf8');
    } else {
      console.log(`File ${newFilename} already exists, not overwriting`);
      process.exit(1);
    }
  } else {
    console.log('File name should end with json or y[a]ml');
  }
}
