module.exports = setUrl;

const _signer = require('./lib/signer');

function setUrl(req, _res, _ctx, _ee, done) {
  req.url = '/';
  return done();
}
