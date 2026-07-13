// NodeNext/ESM-style specifier: '.js' on disk is actually '.ts'.
// esbuild resolves this natively; a naive extension probe does not.

// Directory import resolved via package.json "main" — another case a
// naive extension/index probe misses.
import { mark } from '../lib';
import { tag } from '../shared/helper.js';

export function before(_req: any, ctx: any, _ee: any, done: () => void) {
  tag(ctx);
  mark(ctx);
  return done();
}
