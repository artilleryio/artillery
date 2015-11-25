'use strict';

const YAML = require('yamljs');
const fs = require('fs');
const path = require('path');

module.exports = convert;

function convert(filename) {
  let contents = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('json')) {
    let json = JSON.parse(contents);
    let yaml = YAML.stringify(json, 2);
    let newFilename = path.basename(filename, '.json') + '.yml';
    if (!fs.existsSync(newFilename)) {
      fs.writeFileSync(newFilename, yaml, 'utf8');
    } else {
      console.log(`File ${newFilename} already exists, not overwriting`);
      process.exit(1);
    }
  } else if (filename.endsWith('yml')) {
    let yaml = YAML.parse(contents);
    let json = JSON.stringify(yaml, null, 2);
    let newFilename = path.basename(filename, '.yml') + '.json';
    if (!fs.existsSync(newFilename)) {
      fs.writeFileSync(newFilename, json, 'utf8');
    } else {
      console.log(`File ${newFilename} already exists, not overwriting`);
      process.exit(1);
    }
  } else {
    console.log('File name should end with json or yml');
  }
}
