var _faker = require('faker');
var base = require('./_baseProcessor');

module.exports = {
  doSomething: (userContext, _events, done) => {
    userContext.vars.something = 'do';
    return done();
  },
  printStatus: base.printStatus,
  generateRandomTiming: base.generateRandomTiming
};
