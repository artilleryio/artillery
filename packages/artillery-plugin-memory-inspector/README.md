# artillery-plugin-memory-inspector

This Plugin is useful for searching for memory leaks of applications you are working on. By providing it an id (`pid`), the plugin will emit custom metrics with the `cpu` and `memory` of the process running your application.

The plugin will emit histograms of these metrics and provide you with a summary at the end. Currently, it will emit them for each VU execution.


## Install the plugin

```sh
npm install -g artillery-plugin-memory-inspector
```

## Configuration

### `pid`

The process ID to inspect. 

You can set more than one `pid` to be watched by the plugin, so that you can watch more than one process. This might be useful if you have different versions of the application you want to test against, for instance, and want to leverage Artillery's scenario weights for that.

### `name`

_Optional_. The name of the process to display in the custom metrics report. It is the name that will show up in the custom metrics, otherwise defaults to `process_${pid}`.

### Example Usage

```yaml
config:
  target: "http://localhost:4444"
  phases:
    - duration: 600
      arrivalRate: 3
      name: "Phase 1"
  processor: "./myProcessor.js"
  plugins:
    memory-inspector:
      - pid: 60754
        name: memory-leak-express
      - pid: 11216
        name: stable-state

scenarios:
  - flow:
      - get:
          url: "/"
```

### Getting Artillery Extended Metrics

For convenience, you are also able to emit Artillery's own NodeJS memory usage metrics. This is useful in case you want to debug if something is happening with Artillery. To do this, run your artillery script with `ARTILLERY_INTROSPECT_MEMORY=true`, and the plugin enabled:

```yaml
  plugins:
    memory-inspector: {}
```

This will emit the following additional metrics from [`process.memoryUsage`](https://nodejs.org/api/process.html#processmemoryusage):
- artillery_internal.rss
- artillery_internal.external
- artillery_internal.heap_total
- artillery_internal.heap_used