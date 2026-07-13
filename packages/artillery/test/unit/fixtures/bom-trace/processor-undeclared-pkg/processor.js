const _ = require('lodash');

function before(_req, ctx, _ee, done) {
  ctx.vars.id = _.uniqueId();
  return done();
}

module.exports = { before };
