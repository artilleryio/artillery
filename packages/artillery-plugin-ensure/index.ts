// IMPORTANT: this file must stay free of TypeScript-only syntax
// (annotations, casts). It is the package entry that CommonJS
// consumers reach via require() (e.g. the CLI's Fargate runner);
// require-extension hooks (pirates via @tapjs/processinfo) bypass
// Node's native type stripping for directly-required files.

export { Plugin } from './plugin.ts';
