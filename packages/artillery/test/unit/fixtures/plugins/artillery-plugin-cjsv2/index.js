// v2 plugin interface: module exports an object with a Plugin constructor
class Plugin {
  constructor(_script, _events) {
    this.kind = 'cjs-v2';
  }
}

module.exports.Plugin = Plugin;
