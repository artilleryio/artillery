module.exports = setUrl;

const signer = require('./lib/signer');

function setUrl(req, res, ctx, ee, done) {
  req.url = '/';
  return done();
}
