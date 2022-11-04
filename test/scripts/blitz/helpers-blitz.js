module.exports = { maybeSleep };

function maybeSleep(req, context, events, done) {
  if (Math.random() < 0.7) {
    return done();
  }

  setTimeout(() => {
    return done();
  }, Math.random() * 1000);
}
