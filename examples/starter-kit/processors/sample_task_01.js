var faker = require('faker');
var base = require('./_baseProcessor');

module.exports = {
    doSomething: (userContext, events, done) => {
        userContext.vars.something = "do";
        return done();
    },
    printStatus: base.printStatus,
    generateRandomTiming: base.generateRandomTiming
};