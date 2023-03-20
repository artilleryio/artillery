## Splunk

The plugin supports sending metrics to Splunk Observability Cloud via Ingest API.

By default, all Artillery metrics will be sent to Splunk. Each Artillery metric will create a custom Splunk metric, which will have an associated charge.

You can configure a specific list of metrics to send with the includeOnly setting (see Configuration section below).

- To send metrics to Splunk, set `type` to `splunk`.
- Set `accessToken` to your organisation's `INGEST` access token
- `realm` -- use this to override the default Splunk endpoint which is set to the `us0` realm. A realm is a self-contained deployment that hosts organizations. You can find your realm name on your profile page in the user interface.
- `prefix` -- use a prefix for metric names created by Artillery; defaults to artillery.
- `dimensions` -- a list of name:value strings to use as dimensions for all metrics sent during a test. [Dimensions](https://docs.splunk.com/Observability/metrics-and-metadata/metrics-dimensions-mts.html#dimensions) are metadata sent in along with the metrics in the form of key-value pairs. They provide additional information about the metric, such as the name of the host that sent the metric. See type of information suitable for dimensions [here](https://docs.splunk.com/Observability/metrics-and-metadata/metric-names.html#type-of-information-suitable-for-dimensions)
- `excluded` -- A list of metric names which should not be sent to Splunk. Defaults to an empty list, i.e. all metrics are sent to Splunk.
- `includeOnly` -- A list of specific metrics to send to Splunk. No other metrics will be sent. Defaults to an empty list, i.e. all metrics are sent to Splunk.

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
        accessToken: "{{ $processEnvironment.SP_ACCESS_TOKEN }}"
        prefix: "artillery.publish_metrics_plugin."
        dimensions:
          - "host:server_1"
          - "host_id:1.2.3.4"
```

### Not Currently Supported

- Sending Events (e.g. test start/finish)
