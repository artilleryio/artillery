const _ = require('lodash');

function before(req, ctx, ee, done) {
  ctx.vars.id = _.uniqueId();
  return done();
}

module.exports = { before };
