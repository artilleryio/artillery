// ESM processor - .js in a "type": "module" package
export const formatName = 'esm-js';

export function greet(context, _events, done) {
  context.vars.greeting = 'hello from esm-js';
  return done();
}
