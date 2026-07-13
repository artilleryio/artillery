// ESM processor using top-level await
const value = await Promise.resolve('hello from esm-tla');

export const formatName = 'esm-tla';

export function greet(context, _events, done) {
  context.vars.greeting = value;
  return done();
}
