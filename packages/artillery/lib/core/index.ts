// IMPORTANT: this file must stay free of TypeScript-only syntax
// (annotations, casts). It is the package entry that CommonJS
// consumers reach via require(); require-extension hooks (e.g.
// pirates via @tapjs/processinfo) bypass Node's native type
// stripping for directly-required files. Erasure-identical source
// keeps the entry loadable everywhere; everything imported from it
// loads through the ESM loader, where stripping always applies.

export { default as engine_http } from './engine_http.ts';
export { default as isIdlePhase } from './is-idle-phase.ts';
export * as runner from './runner.ts';
export * as ssms from './ssms.ts';
// Side effect: sets up the global artillery object on load
export { updateGlobalObject } from './update-global-object.ts';
