# Metric / SLO checks with Artillery

With this plugin Artillery can validate if a metric meets a predefined threshold or condition. You can create simple checks, e.g. that `p95` response time is <250ms, or more complex conditions which are based on several metrics.

If an `ensure` check fails Artillery will exit with a non-zero exit code. This is useful in CI/CD pipelines for automatic quality checks and as a way to check that SLOs are met.

Docs: https://www.artillery.io/docs/reference/extensions/ensure

## Example

In the following example, we set three `ensure` checks:

1. The first one checks that HTTP response time `p95` is <= 1000ms, with a `threshold` check
2. The second one uses a more complex conditional expression, and checks that HTTP response time `p99` is less than 2000ms **and** that at least 10 virtual users were launched
3. The third check makes sure that all virtual user scenarios completed successfully

```yaml
config:
  target: "https://www.artillery.io"
  plugins:
    ensure: {}
  phases:
    - duration: 10
      arrivalRate: 1
  ensure:
    thresholds:
      - engine.http.response_time.p95: 1000
    conditions:
      - expression: engine.http.response_time.p99 < 2000 and core.vusers.created.total > 10
        strict: false
      - expression: core.vusers.failed == 0
scenarios:
  - flow:
      - get:
          url: "/"
      - get:
          url: "/docs"
      - get:
          url: "/integrations"
```

## License

MPL 2.0
