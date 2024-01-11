// required files and modules:
const dummyUtil = require('./dummy-util');
const localModDir = require('./local-mod-dir');
const nonIncludedJson = require('./not-included.json');

// required external packages:
const yaml = require('js-yaml');
const uuid = require('uuid');
// const enomod = require('./myenomod'); // won't get detected, rightfully so, but will cause a failure in the worker

const fs = require('fs');
const path = require('path');

function checkBundle(req, userContext, events, done) {
  let maybeErr = null;
  try {
    // picked up via require() calls in here:
    fs.statSync(path.join(__dirname, 'dummy-util.js'));
    fs.statSync(path.join(__dirname, 'local-mod-dir', 'index.js'));
    fs.statSync(path.join(__dirname, 'not-included.json'));

    // not working right now
    // // picked up via plugins.http-file-uploads.filePaths:
    // fs.statSync(path.join(__dirname, 'files', 'dog.jpg'));

    // picked up via payload.path:
    fs.statSync(path.join(__dirname, 'data', 'user-data.csv'));

    // picked up via includeFiles (as a dir):
    fs.statSync(path.join(__dirname, 'data', 'names-prod.csv'));
    fs.statSync(path.join(__dirname, 'data', 'lists.json'));
  } catch (fsErr) {
    maybeErr = fsErr;
  }
  return done(maybeErr);
}

module.exports = { checkBundle };
