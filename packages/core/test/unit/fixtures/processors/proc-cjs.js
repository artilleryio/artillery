// CJS processor
module.exports = {
  formatName: 'cjs-js',
  greet: (context, _events, done) => {
    context.vars.greeting = 'hello from cjs-js';
    return done();
  }
};
