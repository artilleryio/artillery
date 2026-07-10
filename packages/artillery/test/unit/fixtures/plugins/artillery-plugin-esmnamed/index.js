// ESM plugin with a named Plugin export (v2 interface)
export class Plugin {
  constructor(_script, _events) {
    this.kind = 'esm-named';
  }
}
