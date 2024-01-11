module.exports = setUrl;

const AWS = require('aws-sdk');
const signer = require('./lib/signer');

function setUrl(req, res, ctx, ee, done) {
  req.url = '/';
  return done();
}
