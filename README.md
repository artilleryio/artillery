```
            _   _ _ _
  __ _ _ __| |_(_) | | ___ _ __ _   _
 / _` | '__| __| | | |/ _ \ '__| | | |
| (_| | |  | |_| | | |  __/ |  | |_| |
 \__,_|_|   \__|_|_|_|\___|_|   \__, |
                                |___/
```

**Artillery** is modern multi-protocol load-generator with a strong focus on
developer happiness and a batteries-included philosophy. Use it to load-test
your webapp backend, API or microservice to help make it faster, more resilient,
and more scalable.

[![https://artillery.io](https://dl.dropboxusercontent.com/u/476522/artillery/wwwbadge.png)](https://artillery.io) [![Build Status](https://travis-ci.org/shoreditch-ops/artillery.svg?branch=master)](https://travis-ci.org/shoreditch-ops/artillery) [![gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/shoreditch-ops/artillery)

# Features

- HTTP and WebSocket support
- Detailed performance metrics (latency, RPS, throughput)
- Graphical reports
- Test scenarios are just easy-to-read JSON - all declarative, no code ([see an example](https://github.com/shoreditch-ops/artillery-core/blob/master/test/scripts/all_features.json))
- Dynamic payloads from external CSV files
- Use Artillery as a standalone CLI tool or as a Node.js library
- Good performance
- Plugin support (experimental) - [docs](https://github.com/shoreditch-ops/artillery/blob/master/docs/plugins.md)
- Open-source & free

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
[ISC](http://en.wikipedia.org/wiki/ISC_license) license.

```
Copyright (c) 2015-2016, Hassy Veldstra <h@veldstra.org>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```
