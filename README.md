<p align="center">
<a href="https://artillery.io"><img src="https://dl.dropboxusercontent.com/u/476522/artillery/flag.gif" width="390" /></a>
</p>
<p align="center">
<em><strong>Artillery</strong> is a modern, powerful, easy-to-use load-testing toolkit.</em>
</p>

<p align="center">
Artillery has a strong focus on developer happiness & ease of use, and a batteries-included philosophy.

Artillery's goal is to help developers build <strong>faster</strong>, more <strong>resilient</strong> and more <strong>scalable</strong> applications.
</p>

## Features

- **Mulitple protocols**:  Load-test HTTP, WebSocket and Socket.io applications
- **Scenarios**: Specify *scenarios* to test multi-step interactions in your API or web app
- **Perfomance metrics**: get detailed performance metrics (latency, requests per second, concurrency, throughput)
- **Scriptable**: write custom logic in JS to do pretty much anything
- **High performance**: generate serious load on modest hardware
- **Integrations**: `statsd` support out of the box for real-time reporting (integrate with [Datadog](http://docs.datadoghq.com/guides/dogstatsd/), [Librato](https://www.librato.com/docs/kb/collect/collection_agents/stastd.html), [InfluxDB](https://influxdata.com/blog/getting-started-with-sending-statsd-metrics-to-telegraf-influxdb/) etc)
- **Extensible**: custom reporting plugins, custom protocol engines etc
- **and more!** HTML reports, nice CLI, parameterization with CSV files

---

- **Source**: [https://github.com/shoreditch-ops/artillery](https://github.com/shoreditch-ops/artillery)
- **Issues**: [https://github.com/shoreditch-ops/artillery/issues](https://github.com/shoreditch-ops/artillery/issues)
- **Chat**: [https://gitter.im/shoreditch-ops/artillery](https://gitter.im/shoreditch-ops/artillery)
- **Docs**: [https://artillery.io/docs/](https://artillery.io/docs/)
- **Website**: [https://artillery.io](https://artillery.io)
- **Twitter**: [@ShoreditchOps](https://twitter.com/shoreditchops)
- **Enterprise**: Training, custom integrations, professional services: [https://artillery.io/services-support.html](https://artillery.io/services-support.html)

[![Build Status](https://travis-ci.org/shoreditch-ops/artillery.svg?branch=master)](https://travis-ci.org/shoreditch-ops/artillery) [![gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/shoreditch-ops/artillery)

# Use Cases

- **Peak traffic testing** - ensure your e-commerce backend, IoT service or web API can handle max traffic
- **Pre-launch load testing** - for new websites, mobile app backends, web APIs etc
- **Continuous performance testing** for new microservices as they are being built
- **Preventing performance regressions** - stop performance regressions due to new code or config changes before they are shipped to users
- **Help profile & debug** common issues such as extensive GC pauses, memory leaks, improperly configured resource pools etc

There's a lot of fun to be had with a good load generator like Artillery.

# Quickstart

### Install

**Artillery** is available via [npm](http://npmjs.org)

`$ npm install -g artillery`

Node.js v4+ is required (Node.js 6 is recommended).

### Run A Quick Test

`$ artillery quick -d 30 -r 5 -n 20 http://127.0.0.1:3000/test`

This will run a test for 30 seconds, with 5 new virtual users created every second, with each user sending 20 a `GET` requests to `http://127.0.0.1:3000/test`.

### Run With A Scenario

Artillery's power lies in emulating complex behavior, like that of users of an e-commerce website, a transactional API etc.

Run a scenario with:

`$ artillery run hello.yaml`

Where `hello.yaml` is your tests script that contains something like:

(*NB:* test scripts can be written as JSON too)

```yaml
config:
  target: "http://127.0.0.1:3000"
  phases:
    - duration: 120
      arrivalRate: 10
  defaults:
    headers:
      content-type: "application/json"
      x-my-service-auth: fedcba9876543210
scenarios:
  - flow:
      - get:
          url: "/test"
      - think: 1
      - post:
          url: "/test"
          json:
            name: "Hassy"
```

This will run a test for 2 minutes, with 10 virtual users created every second, each of which will send a `GET` and a `POST` request with a pause of 1 second in between. Each request will include two custom headers (`Content-Type` and `X-My-Service-Auth`).

### Create A HTML Report

Once the test completes, you can create a graphical report from the JSON stats produced by `artillery run` with:
`artillery report <report_xxxxx.json>`

These are self-contained HTML files that can be easily shared via email or Dropbox for example.

### Learn More

See [Artillery docs](https://artillery.io/docs/) for docs and examples.

# Contributing

Thinking of contributing to Artillery? Awesome! Please have a quick look at [the
guide](CONTRIBUTING.md).

# Using Artillery?

Are you using Artillery to ship faster, more resilient and more scalable systems? Add your team to the [Artillery users list on the wiki](https://github.com/shoreditch-ops/artillery/wiki/Companies-using-Artillery).


# License

**Artillery** is open-source software distributed under the terms of the
[MPL2](https://www.mozilla.org/en-US/MPL/2.0/) license.

[MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
