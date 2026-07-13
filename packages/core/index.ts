// IMPORTANT: this file must stay free of TypeScript-only syntax
// (annotations, casts). It is the package entry that CommonJS
// consumers reach via require(); require-extension hooks (e.g.
// pirates via @tapjs/processinfo) bypass Node's native type
// stripping for directly-required files. Erasure-identical source
// keeps the entry loadable everywhere; everything imported from it
// loads through the ESM loader, where stripping always applies.

export { default as engine_http } from './lib/engine_http.ts';
export { default as isIdlePhase } from './lib/is-idle-phase.ts';
export * as runner from './lib/runner.ts';
export * as ssms from './lib/ssms.ts';
// Side effect: sets up the global artillery object on load
export { updateGlobalObject } from './lib/update-global-object.ts';
