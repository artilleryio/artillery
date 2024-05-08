'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createHash } = require('crypto');
const { sleep } = require('../lib/util.js');

async function deleteFile(path) {
  fs.unlinkSync(path);
  return true;
}

function returnTmpPath(fileName) {
  return path.resolve(`${os.tmpdir()}/${fileName}`);
}

function generateTmpReportPath(testName, extension) {
  return returnTmpPath(
    `report-${createHash('md5')
      .update(testName)
      .digest('hex')}-${Date.now()}.${extension}`
  );
}

function getTestId(outputString) {
  const regex = /Test run id: \S+/;
  const match = outputString.match(regex);
  return match[0].replace('Test run id: ', '');
}

module.exports = {
  deleteFile,
  generateTmpReportPath,
  getTestId
};
