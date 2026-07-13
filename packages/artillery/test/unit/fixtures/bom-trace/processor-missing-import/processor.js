const helper = require('./not-here');

function before(_req, ctx, _ee, done) {
  helper?.tag(ctx);
  return done();
}

module.exports = { before };
