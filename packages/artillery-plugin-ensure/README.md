# Metric / SLO checks with Artillery

With this plugin Artillery can validate if a metric meets a predefined threshold or condition. You can create simple checks, e.g. that `p95` response time is <250ms, or more complex conditions which are based on several metrics.

If an `ensure` check fails Artillery will exit with a non-zero exit code. This is useful in CI/CD pipelines for automatic quality checks and as a way to check that SLOs are met.

Docs: https://www.artillery.io/docs/guides/guides/test-script-reference#ensure---slo-checks

## License

MPL 2.0
