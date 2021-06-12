# artillery-plugin-publish-metrics

[![CircleCI](https://circleci.com/gh/artilleryio/artillery-plugin-publish-metrics.svg?style=svg)](https://circleci.com/gh/artilleryio/artillery-plugin-publish-metrics)

## Purpose

Send metrics and events from Artillery to external monitoring and observability systems. Observe all the things!

**Supported targets:**

- Datadog metrics (via [agent](https://docs.datadoghq.com/agent/) or [HTTP API](https://docs.datadoghq.com/api/))
- [Honeycomb](https://honeycomb.io) events
- [Lightstep](https://lightstep.com) spans
- [Mixpanel](https://mixpanel.com) events
- InfluxDB metrics with [Telegraf + StatsD plugin](https://github.com/influxdata/telegraf/tree/master/plugins/inputs/statsd)
- StatsD metrics

## Docs

📖 [Plugin docs](https://artillery.io/docs/guides/plugins/plugin-publish-metrics.html)

# License

MPL 2.0

# Bugs & feature suggestions

Please create an [issue](https://github.com/artilleryio/artillery/issues) to report a bug or suggest an improvement.

## Wishlist

- CloudWatch
- Prometheus
- InfluxDB (HTTP API)
- Splunk
- ELK

Want to help add your favorite monitoring system? Let us know via Issues or on Discord: https://discord.com/invite/37vGhH3NMB
