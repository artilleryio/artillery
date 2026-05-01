const helper = require('./not-here');

function before(req, ctx, ee, done) {
  helper && helper.tag(ctx);
  return done();
}

module.exports = { before };
