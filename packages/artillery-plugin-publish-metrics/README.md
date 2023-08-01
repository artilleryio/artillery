# artillery-plugin-publish-metrics

**This plugin is part of Artillery and does not need to be installed separately.**

The plugin sends metrics and events from Artillery tests to external monitoring and observability systems.

### Supported destinations

- [AWS CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/working_with_metrics.html)
- Datadog - (via [agent](https://docs.datadoghq.com/agent/) or [HTTP API](https://docs.datadoghq.com/api/))
- [Splunk](https://splunk.com)
- [Prometheus](https://prometheus.io/docs/concepts/metric_types/) via [Pushgateway](https://prometheus.io/docs/instrumenting/pushing/)
- [Honeycomb](https://honeycomb.io)
- [Lightstep](https://lightstep.com)
- [New Relic](https://newrelic.com/)
- [Mixpanel](https://mixpanel.com)
- InfluxDB with [Telegraf + StatsD plugin](https://github.com/influxdata/telegraf/tree/master/plugins/inputs/statsd)
- StatsD
- [Dynatrace](https://dynatrace.com/)

## Docs

📖 [Plugin docs](https://artillery.io/docs/guides/plugins/plugin-publish-metrics.html)

## Wishlist

- InfluxDB (HTTP API)
- ELK
