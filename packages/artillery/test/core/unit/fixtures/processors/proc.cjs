// CJS processor with explicit .cjs extension
module.exports = {
  formatName: 'cjs-cjs',
  greet: (context, _events, done) => {
    context.vars.greeting = 'hello from cjs-cjs';
    return done();
  }
};
