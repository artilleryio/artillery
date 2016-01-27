# Writing an Artillery plugin

Artillery has a plugin interface. A plugin can register to receive events emitted by Artillery as a test is running and do various useful things.

## Plugin lifecycle

- The user enables the plugin in the `config.plugins` section of their test definition file, e.g.:

  ```javascript
  {
    "config": {
      "target": "http://myawesomeapp.dev",
      // ...
      "plugins": {
        "statsd": {
          "host": "10.11.12.13"
        }
      }
    },
    "scenarios": {
      // ...
    }
  }
  ```

- Artillery looks through `config.plugins` before running the test, and for each entry:
  - `require()`s `'artillery-plugin'+ pluginName` where `pluginName` is the key in `config.plugins`, i.e. `artillery-plugin-statsd` in this instance.
  - The plugin is initialised by calling the exported constructor function with two parameters:
    1. `config` - the entirety of the config
    2. `ee` - an EventEmitter instance on which the plugin can subscribe to events from the core
  - If the plugin instance has a `report` method, that will be called just before the final test JSON report is returned from core. This can be used by plugins to extend the report. The `report` function can return:
    1. `null` - this means there is nothing to report
    2. an object - this will be inserted into the `aggregate` section of the report, under the key `pluginName` (`"statsd"` to continue with our example)
    3. an array of objects - each of the objects should have a `timestamp` property which should be either a timestamp or `"aggregate"`. Objects with a timestamp will be appended to the appropriate `intermediate` entry in the final report (one that matches the timestamp), and the object with `timestamp` = `"aggregate"` will be inserted into the `aggregate` section of the report as in (2). The key name, as above, is `pluginName`.

### Events

Events that plugins can subscribe to:

- `phaseStarted`
- `phaseCompleted`
- `stats`
- `done`

## Example

Take a look at [artillery-plugin-statsd](https://github.com/shoreditch-ops/artillery-plugin-statsd) for a simple example of a plugin.

## Writing a plugin?

Let us know if you run into any issues or need guidance by creating an [Issue](https://github.com/shoreditch-ops/artillery/issues).

Artillery has a focus on UX and a "batteries included" philosophy, therefore if your plugin is stable and published under a non-viral open-source license, we will include it in the default Artillery distribution.
