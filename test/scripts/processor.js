'use strict';

module.exports = {
  printHello: printHello
};

function printHello(req, ctx, events, done) {
  console.log('hello from processor');
  return done();
}
