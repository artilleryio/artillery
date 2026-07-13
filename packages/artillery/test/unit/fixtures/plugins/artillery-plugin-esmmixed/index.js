// ESM plugin with a non-function default export alongside a named
// Plugin export (v2 interface)
export default { some: 'metadata' };

export class Plugin {
  constructor(_script, _events) {
    this.kind = 'esm-mixed';
  }
}
