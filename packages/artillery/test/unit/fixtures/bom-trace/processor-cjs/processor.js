const _ = require('lodash');
const helper = require('./helper');

function before(_req, ctx, _ee, done) {
  ctx.vars.id = _.uniqueId();
  helper.tag(ctx);
  return done();
}

module.exports = { before };
