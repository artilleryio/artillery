const bc = require('@babel/core');
const uuid = require('uuid');
const client = require('@aws-sdk/client-lambda');

module.exports = {
  setUrl: require('./set-url')
};
