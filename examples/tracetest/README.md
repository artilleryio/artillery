# Tracetest

[Tracetest.io](https://tracetest.io/) is a modern testing tool that leverages distributed tracing to run observability-enabled tests, allowing to assert on whether your system is working correctly at a deeper level.

## Why is this important?

With Performance Testing, it can sometimes be difficult to assert that everything is working correctly in a distributed system. For example, let's say your API responds within your SLO, but fails to send a message to a message queue at large scale (which another internal component needs). Your Performance test may be passing, but your system as a whole would still have a broken component. This is where combining Artillery with Tracetest comes in - you can make sure your entire system still functions as expected under load (even components that aren't user-facing).

## Examples

### Playwright

Please follow this example created by the Tracetest team: https://docs.tracetest.io/examples-tutorials/recipes/running-playwright-performance-tests-with-artillery-and-tracetest


In the example above, you'll be able to create a Playwright scenario to run with Artillery's Playwright engine. The scenario will also generate a distributed trace per virtual user that can be tested using Tracetest. 

### HTTP Engine

Please follow the example available in the Tracetest documentation: https://docs.tracetest.io/tools-and-integrations/artillery-plugin

In the example above, you'll be creating an HTTP scenario and running it with Artillery, also publishing metrics by using the `publish-metrics` OpenTelemetry reporter. The scenario will also generate a distributed trace per virtual user that can be tested using Tracetest, allowing you to test things like database processing time.

## Questions

For any questions on integrating Artillery with Tracetest, please reach out to the [Tracetest team](https://tracetest.io/community) or reach out to Artillery on [Github](https://github.com/artilleryio/artillery/discussions).

