## New Relic

To send metrics and/or events to New Relic set `type` to `newrelic`:

```yaml
config:
  plugins:
    publish-metrics:
      - type: newrelic
        apiKey: '{{ $processEnvironment.NEW_RELIC_LICENSE_KEY }}'
        prefix: 'artillery.'
        attributes:
          - 'type:soak-test'
          - 'service:my-service'
```

By default, all Artillery metrics will be sent to New Relic. Each Artillery metric will create a custom New Relic metric, which may have an associated cost.

### Configuration options

- To send metrics to New Relic, set `type` to `newrelic`.
- Set `licenseKey` to the license key for the account you want to send the metrics to
- `region` -- `us` (default) or `eu`. Thes sets default New Relic endpoint. If your account hosts data in the EU data center set the region to eu.
- `prefix` -- set a prefix for metric names created by Artillery; defaults to `artillery`.
- `attributes` -- a list of `name:value` strings to use as tags for all metrics sent during a test
- `excluded` -- a list of metric names which should not be sent to New Relic. Defaults to an empty list, i.e. all metrics are sent to New Relic.
- `includeOnly` -- a list of specific metrics to send to New Relic. No other metrics will be sent. Defaults to an empty list, i.e. all metrics are sent to New Relic.
- `event` -- set to send a New Relic event when the test starts/finishes.
  - `accountId` -- your New Relic [account ID](https://docs.newrelic.com/docs/accounts/accounts-billing/account-structure/account-id/).
  - `eventType` -- set to customize the event's name, defaults to `Artillery_io_Test`. Must be a string that is a combination of alphanumeric characters, underscores, and colons.
  - `send` -- set to `false` to turn off the event. By default, if an event is configured, it will be sent. This option makes it possible to turn event creation on/off on the fly (e.g. via an environment variable)
  - `attributes` -- optional list of `name:value` strings to use as attributes/tags for events sent during a test. By default Artillery sends the `target: <target set in the script config>`, `timestamp: <timestamp of start/end of test>` and `phase: 'Test Started' / 'Test Finished'` attributes. Any `attributes` set will be sent in addition to the default ones. Check character [restrictions] for attributes [here](https://docs.newrelic.com/docs/data-apis/ingest-apis/event-api/introduction-event-api/#instrument)

```yaml
config:
  plugins:
    publish-metrics:
      - type: newrelic
        apiKey: '{{ $processEnvironment.NEW_RELIC_LICENSE_KEY }}'
        prefix: 'artillery.'
        attributes:
          - 'type:soak-test'
          - 'service:my-service'
        event:
          accountId: '{{ $processEnvironment.NEW_RELIC_ACCOUNT_ID }}'
          eventType: 'Artillery_load_test'
          attributes:
            'alertType:info'
            'priority:low'
            'testId:myTest123'
```

### Debugging

Set DEBUG=plugin:publish-metrics:newrelic when running your tests to print out helpful debugging messages when sending metrics to New Relic.

```
DEBUG=plugin:publish-metrics:newrelic artillery run my-script.yaml
```
