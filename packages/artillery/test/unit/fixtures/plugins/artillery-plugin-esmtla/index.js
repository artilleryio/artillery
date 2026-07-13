// ESM plugin using top-level await (v2 interface)
const kind = await Promise.resolve('esm-tla');

export class Plugin {
  constructor(_script, _events) {
    this.kind = kind;
  }
}
