// Loose declarations for TypeScript consumers.
// package.json "types" points here so external tsc builds use these
// instead of following "main" into the .ts sources, which would be
// compiled with the consumer's own (incompatible) compiler settings.
// Before the ESM migration this package shipped untyped .js - these
// `any` declarations preserve that contract. Real types come later.

export declare const engine_util: any;
export declare const jitter: any;
