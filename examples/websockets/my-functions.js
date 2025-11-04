module.exports = { createRandomScore };

function createRandomScore(userContext, _events, done) {
  const data = {
    timestamp: Date.now(),
    score: Math.floor(Math.random() * 100)
  };

  // set the "data" variable for the virtual user to use in the subsequent action
  userContext.vars.data = data;

  return done();
}
