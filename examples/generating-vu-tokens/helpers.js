module.exports = {
  generateSharedToken,
  generateVUToken
};

function generateSharedToken(context, events, done) {
  context.vars.sharedToken = `shared-token-${Date.now()}`;
  return done();
}

function generateVUToken(context, events, done) {
  context.vars.vuToken = `vu-token-${Date.now()}`;
  return done();
}
