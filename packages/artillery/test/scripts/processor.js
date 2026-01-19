

module.exports = {
  printHello: printHello,
  createNewVar: createNewVar,
  rewriteUrl: rewriteUrl,
  checkGlobal: checkGlobal
};

function printHello(_req, _ctx, _events, done) {
  console.log('# hello from processor');
  return done();
}

// Ref: https://github.com/shoreditch-ops/artillery/issues/184
// See hello.json - testing that scenario-level beforeRequest is handled
// correctly.
function _doNothing(_req, _ctx, _events, done) {
  return done();
}

// this function is called in a loop
function createNewVar(ctx, _events, done) {
  ctx.vars.newVar = ctx.vars.$loopCount;
  console.log(`createNewVar: ${ctx.vars.$loopCount}`);
  return done();
}

function rewriteUrl(req, _ctx, _events, done) {
  req.url = '/';
  return done();
}

function checkGlobal(_ctx, _events, done) {
  if (!global.artillery) {
    return done(new Error('global artillery object not found'));
  } else {
    console.log(`[${process.pid}] artillery.version: ${artillery.version}`);
    return done();
  }
}
