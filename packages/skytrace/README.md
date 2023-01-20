
<div align="center">
  <img src="/packages/skytrace/skytrace-logo.svg" width="80">
  <h1>Skytrace<br />fast & simple end-to-end testing</h1>
</div>

**Skytrace makes it easy to write, run and reuse e2e tests.**

* Write flows fast with editor autocomplete and auto-reload mode
* Set assertions and expectations on responses
* Run locally, in CI/CD, or in production
* Batteries-included with 20+ integrations for CICD, monitoring, and observability
* Reuse flows for load testing with Artillery

⚠️ Skytrace is an alpha project ⚠️

## Skytrace Ping

A Swiss-army knife for testing HTTP from the command-line.

* HTTP performance at a glance - DNS lookup, TCP connection, SSL handshake, and TTFB
* Command-line client for HTTP - send HTTP requests, set headers, send JSON. With color highlighting for HTTP responses.
* Set checks and assertions with command-line flags - check status codes, content type, headers, JSON properties and more

![Skytrace Ping](/packages/skytrace/assets/skytrace-ping.png)

## Skytrace Flow

Write &amp; run flows to check that everything is working as expected.

A flow is a sequence of steps that describes how an API or app works from a client's or user's perspective.

* Write flows fast - with editor autocomplete and auto-reload mode
* Set checks and assertions - check API responses and performance automatically
* Run locally, in CI/CD, or in production - re-use flows for local development, as post-deployment checks, or for production monitoring
* Monitoring integrations - send results to Slack, Datadog, Honeycomb, or Lightstep

![Skytrace Flow](/packages/skytrace//assets/skytrace-flow.png)

## Get Started

Install Skytrace with `npm` (Homebrew and self-contained binaries coming soon)

```sh
npm install -g skytrace
```

Ping a URL:

```sh
skytrace ping http://lab.artillery.io/movies -bp
```

Run a [simple flow](./asciiart-flow.yml):

```sh
skytrace run -r asciiart-flow.yml
```

With the `-r` flag Skytrace will run in hot-reload mode. Change one of the checks to something else, save the file, and Skytrace will re-run it rightaway.

## Talk to us

We'd love to hear from you. Share your thoughts, use cases & feedback on our [Discussions forum](https://github.com/artilleryio/artillery/discussions/categories/skytrace).

Report issues via [GitHub Issues](https://github.com/artilleryio/artillery/issues?q=is:open+is:issue+label:skytrace).

## License

MPL-2.0
