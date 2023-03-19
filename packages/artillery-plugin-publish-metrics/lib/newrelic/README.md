## New Relic

The plugin supports sending metrics to the New Relic Metric API.

By default, all Artillery metrics will be sent to New Relic. Each Artillery metric will create a custom New Relic metric, which will have an associated charge.

You can configure a specific list of metrics to send with the includeOnly setting (see Configuration section below).

- To send metrics to New Relic, set `type` to `newrelic`.
- Set `licenseKey` to the license key for the account you want to send the metrics to
- `region` -- use this to override the default New Relic endpoint which is set to the US region. If your account hosts data in the EU data center make sure you set the region to `eu`.
- `prefix` -- use a prefix for metric names created by Artillery; defaults to artillery.
- `attributes` -- a list of name:value strings to use as tags for all metrics sent during a test
- `excluded` -- A list of metric names which should not be sent to New Relic. Defaults to an empty list, i.e. all metrics are sent to New Relic.
- `includeOnly` -- A list of specific metrics to send to New Relic. No other metrics will be sent. Defaults to an empty list, i.e. all metrics are sent to New Relic.


For information on how to query data ingested through the Metrics API consult [New Relic docs](https://docs.newrelic.com/docs/data-apis/ingest-apis/metric-api/introduction-metric-api/#find-data). 


### Debugging

Set DEBUG=plugin:publish-metrics:newrelic when running your tests to print out helpful debugging messages when sending metrics to New Relic

```
DEBUG=plugin:publish-metrics:newrelic artillery run my-script.yaml
```


### Example: New Relic

```
config:
  plugins:
    publish-metrics:
      - type: newrelic
        region: eu
        # NR_LICENSE_KEY is an environment variable containing the API key
        apiKey: "{{ $processEnvironment.NR_LICENSE_KEY }}"
        prefix: 'artillery.publish_metrics_plugin.'
        attributes:
          - "testId:mytest123"
          - "type:loadtest"

```

### Not Currently Supported

- Sending Events (e.g. test start/finish)
- New Relic Agent
