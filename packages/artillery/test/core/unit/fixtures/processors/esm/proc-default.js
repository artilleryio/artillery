// ESM processor with a default export (object of functions)
export default {
  formatName: 'esm-default',
  greet: (context, _events, done) => {
    context.vars.greeting = 'hello from esm-default';
    return done();
  }
};

export function namedAlongsideDefault() {
  return 'named';
}
