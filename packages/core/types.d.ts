// Loose declarations for TypeScript consumers (e.g. skytrace).
// package.json "types" points here so external tsc builds use these
// instead of following "main" into the .ts sources, which would be
// compiled with the consumer's own (incompatible) compiler settings.
// Before the ESM migration this package shipped untyped .js - these
// `any` declarations preserve that contract. Real types come later.

export declare const runner: any;
export declare const engine_http: any;
export declare const ssms: any;
export declare const isIdlePhase: any;
export declare const updateGlobalObject: any;
