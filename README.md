<p align="center">
<a href="https://artillery.io"><img src="https://dl.dropboxusercontent.com/u/476522/artillery/flag.png" width="300" /></a>
</p>

**Artillery** is modern multi-protocol load-generator with a strong focus on
developer happiness and a batteries-included philosophy. Use it to load-test
your webapp backend, API or microservice to help make it faster, more resilient,
and more scalable.

---

- **Source**: [https://github.com/shoreditch-ops/artillery](https://github.com/shoreditch-ops/artillery)
- **Issues**: [https://github.com/shoreditch-ops/artillery/issues](https://github.com/shoreditch-ops/artillery/issues)
- **Chat**: [https://gitter.im/shoreditch-ops/artillery](https://gitter.im/shoreditch-ops/artillery)
- **Docs**: [https://github.com/shoreditch-ops/artillery/wiki](https://github.com/shoreditch-ops/artillery/wiki)
- **Website**: [https://artillery.io](https://artillery.io)
- **Twitter**: [@ShoreditchOps](https://twitter.com/shoreditchops)

[![Build Status](https://travis-ci.org/shoreditch-ops/artillery.svg?branch=master)](https://travis-ci.org/shoreditch-ops/artillery) [![gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/shoreditch-ops/artillery)

# Features

- HTTP and WebSocket support (AMQP coming next)
- Detailed performance metrics (latency, RPS, throughput)
- Graphical reports (self-contained HTML file, handy for embedding in CI or emailing around)
- Test scenarios are just easy-to-read JSON (or YAML) - all declarative, no code ([see an example](https://github.com/shoreditch-ops/artillery-core/blob/master/test/scripts/all_features.json))
- Dynamic payloads from external CSV files (e.g. usernames/passwords for making auth requests)
- Use Artillery as a standalone CLI tool or as a Node.js library
- Good performance (1.2k RPS for HTTP on a modest VPS)
- Plugin support (experimental) - [docs](https://github.com/shoreditch-ops/artillery/blob/master/docs/plugins.md) - e.g. publish stats to Graphite/Librato/DataDog in real-time
- Open-source & free (commercial support is available for enterprise users - [team@artillery.io](mailto:team@artillery.io))

# Use Cases

- Benchmark the performance of your API or microservice as you're building it
- Ensure new code does not introduce performance regressions
- Test your code for memory leaks
- Benchmark dependencies (libraries, frameworks, external services) to get a
  feel for their performance characteristics before you integrate
- Run load-tests before you launch to ensure your application can meet
  projected demand

# Quickstart

## Install

**Artillery** is available via [npm](http://npmjs.org)

`$ npm install -g artillery`

## Run A Quick Test

`$ artillery quick -d 30 -r 5 http://127.0.0.1:3000/test`

This will run a test for 30 seconds with an average of 5 new requests to
`http://127.0.0.1:3000/test` every second.

## Run With A More Complex Scenario

`$ artillery run hello.json`

Where `hello.json` is your tests script that contains something like:

```javascript
{
  "config": {
      "target": "http://127.0.0.1:3000",
      "phases": [
        { "duration": 120, "arrivalRate": 10 }
      ],
      "defaults": {
        "headers": {
          "content-type": "application/json",
          "x-my-service-auth": "987401838271002188298567"
        }
      }
  },
  "scenarios": [
    {
      "flow": [
        { "get": {"url": "/test"}},
        { "think": 1 },
        { "post": {"url": "/test", "json": { "name": "hassy" }}}
      ]
    }
  ]
}
```

# Create A HTML Report

Create a graphical report from the JSON stats produced by `artillery run` with:
`artillery report <report_xxxxx.json>`

# Learn More

- [HTTP Features](https://github.com/shoreditch-ops/artillery/wiki/HTTP-Features)
- [WebSocket Features](https://github.com/shoreditch-ops/artillery/wiki/WebSocket-Features)

# Contributing

Thinking of contributing to Artillery? Awesome! Please have a quick look at [the
guide](CONTRIBUTING.md).

# License

**Artillery** is open-source software distributed under the terms of the
[MPL2](https://www.mozilla.org/en-US/MPL/2.0/) license.

[MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
