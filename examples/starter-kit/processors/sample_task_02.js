var _faker = require('faker');
var base = require('./_baseProcessor');

module.exports = {
  doSomethingElse: (userContext, _events, done) => {
    userContext.vars.something = 'do';
    return done();
  },
  printStatus: base.printStatus,
  generateRandomData: base.generateRandomData
};
