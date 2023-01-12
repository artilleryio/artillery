function generateIds(context, events, done) {
    // your custom logic here
    context.vars['user'] = 'foo';
    context.vars['movie'] = 'bar';
    return done();
  };

  module.exports = {
    generateIds: generateIds
  }
