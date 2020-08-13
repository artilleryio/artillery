# Purpose

Use this plugin to get a per-endpoint breakdown of latency and response codes in your Artillery HTTP tests.

# Usage

Install the plugin globally or locally, depending on your setup

```shell
# Install the plugin globally if Artillery is installed globally:
npm install artillery-plugin-metrics-by-endpoint -g

# Or install into a project's dependencies:
npm install --save-dev artillery-plugin-metrics-by-endpoint
```

Enable the plugin in the config

```yaml
config:
  plugins:
    metrics-by-endpoint: {}
```

Run your tests as normal. There will additional output in the reports, providing latency metrics for each HTTP endpoint hit by the test.

By default the plugin will treat each unique URL as a separate endpoint, e.g. if you tests makes requests to the following URLs:

1. `/foos/1`
2. `/foos/2`

The report will contain latency metrics for both of those URLs. To treat those requests as the same endpoint, add a `name` atribute to the request in your test, and set `useOnlyRequestNames` option in plugin config:

```yaml
config:
  target: "https://my-app.acme-corp.internal"
  plugins:
    metrics-by-endpoint:
      useOnlyRequestNames: true
scenarios:
  - flow:
      - loop:
        - get:
            url: "/foos/{{ $loopElement }}"
            name: "orders"
        count: 100
```

# License

MPL 2.0
