// IMPORTANT: this file must stay free of TypeScript-only syntax
// (annotations, casts). It is the package entry that CommonJS
// consumers reach via require(); require-extension hooks (e.g.
// pirates via @tapjs/processinfo) bypass Node's native type
// stripping for directly-required files. Erasure-identical source
// keeps the entry loadable everywhere; everything imported from it
// loads through the ESM loader, where stripping always applies.

export { getStash } from './stash.ts';
