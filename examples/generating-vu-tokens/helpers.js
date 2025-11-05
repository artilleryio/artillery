module.exports = {
  generateSharedToken,
  generateVUToken
};

function generateSharedToken(context, _events, done) {
  context.vars.sharedToken = `shared-token-${Date.now()}`;
  return done();
}

function generateVUToken(context, _events, done) {
  context.vars.vuToken = `vu-token-${Date.now()}`;
  return done();
}
