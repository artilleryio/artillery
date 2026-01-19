<p align="center">
<img width="1012" alt="artillery-examples" src="https://user-images.githubusercontent.com/1490/139437758-7093853a-2f19-40fd-b827-29d3584cf438.png">
</p>

# Artillery Examples

This repo contains examples of how to use various features in Artillery. Every example is self-contained and can be run as-is without external dependencies (other than those in `package.json`).

## Test scripts

### Core features

- [using-data-from-csv](./using-data-from-csv) - using data from an external CSV file in vuser scenarios
- [scenario-weights](./scenario-weights) - set weights to change how often Artillery runs a scenario
- [script-overrides](./script-overrides) - override parts of the script such as load phases dynamically at runtime
- [multiple-scenario-specs](./multiple-scenario-specs) - organizing your Artillery test codebase into separate scenario files
- [automated-checks](./automated-checks) - setting up automated checks with `ensure` and `apdex` plugins

### How-tos

- [refresh-auth-token](./refresh-auth-token/) - how to refresh an auth token used by a VU as the test is running

### End-to-end examples

- [socket-io](./socket-io) - testing a Socket.io service
- [websockets](./websockets) - testing a WebSocket service
- [graphql-api-server](./graphql-api-server) - testing a GraphQL API server
- [browser-load-testing-playwright](./browser-load-testing-playwright) - load testing with real browsers
- [functional testing](./functional-testing-with-expect-plugin) - use `artillery-plugin-expect` to run both load and functional tests
- [CSV-driven functional testing](./table-driven-functional-tests) - define functional tests with a CSV file

### HTTP-specific examples

- [http-set-custom-header](./http-set-custom-header) - set an HTTP header in a `beforeRequest` hook
- [using-cookies](./using-cookies) - using cookies with HTTP services
- [file-uploads](./file-uploads) - HTTP file uploads with Artillery Pro

### Plugins and extensions

- [track-custom-metrics](./track-custom-metrics) - track custom metrics (counters and histograms)
- [artillery-plugin-hello-world](./artillery-plugin-hello-world) - a "hello world" plugin

## Running Artillery in CI/CD

- [cicd examples](./cicd) - using Artillery with Github Actions, Gitlab CI, Azure DevOps, CircleCI and more

## Starter kits

- [starter-kit](./starter-kit) - @cfryerdev's Artillery starter kit - an example of how a few different bits fit together

## Testing on Kubernetes

- [k8s-testing-with-kubectl-artillery-](./k8s-testing-with-kubectl-artillery)

# Contributing

Would you like to share an example showing how to use a feature in Artillery with the community? Send us a PR 💜

# License

All code in this repo is licensed under the terms of the [MPL2 license](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).
