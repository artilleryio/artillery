<div align="center">
  <img src="https://raw.githubusercontent.com/artilleryio/artillery/main/packages/artillery/artillery-logo.svg" width="80">
  <h1>Artillery</h1>
<p align="center">
  <a href="https://www.artillery.io/docs">Docs</a> | <a href="https://github.com/artilleryio/artillery/discussions">Discussions</a>
</p>

<p align="center">
  <img alt="npm" src="https://img.shields.io/npm/dm/artillery?style=flat-square">
</p>


<a href="https://www.artillery.io/">
  <img
    src="https://www.artillery.io/api/og?title=Full-stack%20reliability%20%26%20performance&description=Scalable%20API%20and%20Playwright%20load%20testing"
  />
</a>

</div>

## Features

- **Test at cloud scale.** Cloud-native distributed load testing at scale, **out-of-the box**. Scale out with AWS Lambda, AWS Fargate or Azure ACI. No DevOps needed, zero infrastructure to set up or manage.
- **Test with Playwright**. Reuse existing Playwright tests and load test with real headless browsers.
- **Batteries-included.** 20+ integrations for monitoring, observability, and CICD.
- **Test anything**. HTTP, WebSocket, Socket.io, gRPC, Kinesis, and more.
- **Powerful workload modeling**. Emulate complex user behavior with request chains, multiple steps, transactions, and more.
- **Extensible & hackable**. Artillery has a plugin API to allow extending and customization.

## Get started

### Install Artillery

```
npm install -g artillery
```

### Run your first test

Follow our 5-minute guide to run your first load test - https://www.artillery.io/docs/get-started/first-test

## Learn more

### Docs and guides

- [Load testing with Playwright](https://www.artillery.io/docs/playwright)
- Distributed load testing with Artillery on [AWS Lambda](https://docs.art/lambda), [AWS Fargate](https://docs.art/fargate), or [Azure ACI](https://docs.art/azure)
- Set [API response expectations](https://docs.art/expect), automate [SLO checks](https://docs.art/ensure), and report [Apdex scores](https://docs.art/apdex)
- [Publishing metrics](https://docs.art/o11y) to Datadog, New Relic, Honeycomb, and any other OTel-compatible platform

### Integrations and plugins

We maintain a list of official and community-built [integrations and plugins](https://www.artillery.io/integrations) on our website: https://www.artillery.io/integrations.

### Example tests

You can find a list of ready-to-run Artillery examples under [`examples/`](https://github.com/artilleryio/artillery/tree/master/examples#readme).
