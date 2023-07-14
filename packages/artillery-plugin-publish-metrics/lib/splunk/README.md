## Splunk

The plugin supports sending [metrics](https://docs.splunk.com/Observability/metrics-and-metadata/metrics.html#metrics-data-points-and-metric-time-series-in-splunk-observability-cloud) and [events](https://docs.splunk.com/Observability/metrics-and-metadata/view-data-events.html#add-context-to-metrics-using-events) to [Splunk Observability Cloud](https://www.splunk.com/en_us/download/o11y-cloud-free-trial.html?utm_campaign=google_emea_tier1_en_search_brand&utm_source=google&utm_medium=cpc&utm_content=O11y_Cloud_Trial&utm_term=%2Bsplunk%20%2Bobservability&_bk=%2Bsplunk%20%2Bobservability&_bt=629596389054&_bm=b&_bn=g&_bg=116486921470&device=c&gclid=CjwKCAjw44mlBhAQEiwAqP3eVqM8GDTFnhgmLzKgZEuDtKM_w1BpXJkN-xg710R3gNmcgAMRkLONxxoCpdUQAvD_BwE) via Ingest API.

By default, all Artillery metrics will be sent to Splunk. Each Artillery metric will create a custom Splunk metric, which will have an associated charge.

To send events set and configure `event` setting (see Configuration section below)

### Configuration

- To send metrics and/or events to Splunk, set `type` to `splunk`.
- Set `accessToken` to your organisation's `INGEST` [access token](https://docs.splunk.com/Observability/admin/authentication-tokens/api-access-tokens.html#retrieve-you-user-api-access-token-session-token)
- `realm` -- use this to override the default Splunk endpoint which is set to the `us0` realm. A realm is a self-contained deployment that hosts organizations. You can find your realm name on your profile page in the user interface.
- `prefix` -- use a prefix for metric names created by Artillery; defaults to artillery.
- `dimensions` -- a list of `name:value` strings to use as dimensions for all metrics sent during a test. [Dimensions](https://docs.splunk.com/Observability/metrics-and-metadata/metrics-dimensions-mts.html#dimensions) are metadata sent in along with the metrics in the form of key-value pairs. They provide additional information about the metric, such as the name of the host that sent the metric. Check out the [type of information](https://docs.splunk.com/Observability/metrics-and-metadata/metric-names.html#type-of-information-suitable-for-dimensions) suitable for dimensions, and dimensions name [requirements](https://docs.splunk.com/Observability/metrics-and-metadata/metric-names.html#dimension-name-requirements).
- `excluded` -- A list of metric names which should not be sent to Splunk. Defaults to an empty list, i.e. all metrics are sent to Splunk.
- `includeOnly` -- A list of specific metrics to send to Splunk. No other metrics will be sent. Defaults to an empty list, i.e. all metrics are sent to Splunk.
- `event` -- set to send an event to Splunk when the test starts/finishes.
  - `eventType` -- event name. Can not contain any blank splaces(" "). Defaults to `Artillery_io_Test`.
  - `send` -- set to `false` to turn off the event. By default, if an event is configured, it will be sent. This option makes it possible to turn event creation on/off on the fly (e.g. via an environment variable)
  - `dimensions` -- a list of `name:value` strings to use as dimensions for events sent to Splunk. By default Artillery sends the `target: <target set in the script config>`, `timestamp: <timestamp of start/end of test>` and `phase: 'Test-Started' / 'Test-Finished'` dimensions. Any `dimensions` set in script will be sent in addition to the default ones.
  - `properties` -- a list of `name:value` strings to use as properties for events sent to Splunk. See the difference between dimensions and properties [here](https://docs.splunk.com/Observability/metrics-and-metadata/metrics-dimensions-mts.html#metadata-dimensions-custom-properties-tags-and-attributes)

For information on how to manage data ingested through the Splunk API consult [Splunk docs](https://docs.splunk.com/Observability/metrics-and-metadata/metrics-finder-metadata-catalog.html#use-the-metric-finder-and-metadata-catalog).

### Debugging

Set DEBUG=plugin:publish-metrics:splunk when running your tests to print out helpful debugging messages when sending metrics to Splunk

```
DEBUG=plugin:publish-metrics:splunk artillery run my-script.yaml
```

### Example: Splunk

```yaml
config:
  plugins:
    publish-metrics:
      - type: splunk
        realm: eu0
        # SP_ACCESS_TOKEN is an environment variable containing the API key
        accessToken: '{{ $processEnvironment.SP_ACCESS_TOKEN }}'
        prefix: 'artillery.publish_metrics_plugin.'
        dimensions:
          - 'host:server_1'
          - 'host_id:1.2.3.4'
        event:
          eventType: 'Artillery_load_test'
          dimensions:
            - 'environment:production'
            - 'testId:myTest123'
          properties:
            - 'use:QA'
```
