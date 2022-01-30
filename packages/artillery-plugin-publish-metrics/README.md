# artillery-plugin-publish-metrics

[![CircleCI](https://circleci.com/gh/artilleryio/artillery-plugin-publish-metrics.svg?style=svg)](https://circleci.com/gh/artilleryio/artillery-plugin-publish-metrics)

## Purpose

Send metrics and events from Artillery to external monitoring and observability systems. Chart, analyze and compare performance data from Artillery alongside that of your applications and infrastructure.

### Supported destinations

- Datadog - (via [agent](https://docs.datadoghq.com/agent/) or [HTTP API](https://docs.datadoghq.com/api/))
- [Prometheus](https://prometheus.io/docs/concepts/metric_types/) via [Pushgateway](https://prometheus.io/docs/instrumenting/pushing/)
- [Honeycomb](https://honeycomb.io)
- [Lightstep](https://lightstep.com)
- [Mixpanel](https://mixpanel.com)
- InfluxDB with [Telegraf + StatsD plugin](https://github.com/influxdata/telegraf/tree/master/plugins/inputs/statsd)
- StatsD

## Docs

📖 [Plugin docs](https://artillery.io/docs/guides/plugins/plugin-publish-metrics.html)

# License

MPL 2.0

# Bugs & feature suggestions

Please create an [issue](https://github.com/artilleryio/artillery/issues) to report a bug or suggest an improvement.

## Wishlist

- CloudWatch
- NewRelic
- InfluxDB (HTTP API)
- Splunk
- ELK
