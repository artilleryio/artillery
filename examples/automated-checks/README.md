# Using automated checks

This is an example Artillery load test that includes:

1. A load configuration with 3 distinct phases that create a burst of traffic after a warm up period
2. Configuration for [`apdex`](https://docs.art/reference/extensions/apdex) and [`ensure`](https://docs.art/reference/extensions/ensure) plugins to set up automated scoring and checking of performance results from the test
3. Use of `metrics-by-endpoint` plugin to enable reporting of metrics for each individual URL in the test

Run the script with:

```
artillery run test-with-automated-checks.yml
```
