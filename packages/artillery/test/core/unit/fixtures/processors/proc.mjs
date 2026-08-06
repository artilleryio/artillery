// ESM processor with explicit .mjs extension
export const formatName = 'esm-mjs';

export function greet(context, _events, done) {
  context.vars.greeting = 'hello from esm-mjs';
  return done();
}
