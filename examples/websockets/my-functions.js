module.exports = { createRandomScore, sendStream };

function createRandomScore(userContext, events, done) {
  const data = {
    timestamp: Date.now(),
    score: Math.floor(Math.random() * 100)
  };

  // set the "data" variable for the virtual user to use in the subsequent action
  userContext.vars.data = data;

  return done();
}

function sendStream(userContext, events, done) {
  const fs = require('fs');
  const path = '/path/to/your/wavfile.wav';

  userContext.vars.byteData = fs.readFile(path, (err, data) => {
    // put it on byteData variable to not overide the "data" variable
    userContext.vars.byteData = data;
    return done();
  });
}
