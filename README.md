```
            _   _ _ _
  __ _ _ __| |_(_) | | ___ _ __ _   _
 / _` | '__| __| | | |/ _ \ '__| | | |
| (_| | |  | |_| | | |  __/ |  | |_| |
 \__,_|_|   \__|_|_|_|\___|_|   \__, |
                                |___/
```

**Artillery** is a simple but powerful load-testing tool designed to help you
make your apps more performant, reliable, and scalable.

[https://artillery.io](https://artillery.io)

[![Build Status](https://travis-ci.org/shoreditch-ops/artillery.svg?branch=master)](https://travis-ci.org/shoreditch-ops/artillery)

[![gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/shoreditch-ops/artillery)

# Features

- HTTP(S) and WebSocket support
- Detailed performance metrics (latency, RPS, throughput)
- NEW! Graphical reports
- Test scenarios are just easy-to-read JSON - all declarative, no code ([see an example](https://github.com/shoreditch-ops/artillery-core/blob/master/test/scripts/all_features.json))
- Dynamic payloads
- Use Artillery as a standalone CLI tool or as a Node.js library
- Good performance
- Plugin support (experimental) - [docs](https://github.com/shoreditch-ops/artillery/blob/master/docs/plugins.md)
- Open-source & free

# Quickstart

## Install

**Artillery** is available via [npm](http://npmjs.org)

`$ npm install -g artillery`

## Run

`$ artillery quick -d 30 -r 5 http://127.0.0.1:3000/test`

This will run a test for 30 seconds with an average of 5 new requests to
`http://127.0.0.1:3000/test` every second.

## Run with a more complex scenario

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

You can specify config default values using a `.artilleryrc` file on your home folder or in any other [location supported by `rc`](https://github.com/dominictarr/rc#standards). Have a look at the included `.artilleryrc` for an example.

# Create a report

Create a graphical report from the JSON stats produced by `artillery run` with:
`artillery report <report_xxxxx.json>`

An example:

![https://cldup.com/PYeZJTCe86-1200x1200.png](https://cldup.com/PYeZJTCe86-1200x1200.png)

# Use cases

- Benchmark the performance of your API or microservice as you're building it
- Ensure new code does not introduce performance regressions
- Test your code for memory leaks
- Benchmark dependencies (libraries, frameworks, external services) to get a
  feel for their performance characteristics before you integrate
- Run load-tests before you launch to ensure your application can meet
  projected demand

# Learn More

- [HTTP Features](https://github.com/shoreditch-ops/artillery/wiki/HTTP-Features)
- [WebSocket Features](https://github.com/shoreditch-ops/artillery/wiki/WebSocket-Features)

# Design

## Declarative tests

**Artillery** test cases aim to be 100% declarative. Your test-case describes _what_
needs to happen, not _how_ it happens.

Benefits of this approach:

- Tests can be 100% reproducible, since there is no custom code.
- Test cases can be auto-generated and analysed by other tools - it's just JSON.
- DSLs can be written for any language. We have a JS DSL on the roadmap, and
  one can be written easily for Ruby, Python, Lua or another language.
- Stronger performance guarantees can be made in absence of custom code.

Further reading:
- [Imperative vs Declarative Programming](http://latentflip.com/imperative-vs-declarative/)

## Virtual users

Artillery is centered around virtual users arriving to use your service
according to a predefined scenario (or a number of scenarios) for realistic
simulation of load on the system. This stands in contrast to conventional
load-testing tools that create a small number of connections to the target
server and send many requests in a loop over the same connection.

That said, some situations do call for the latter approach (e.g. for
testing AMQP or long-lived WebSocket connections) and Artillery provides
functionality to support this type of usage.

# Contributing

Thinking of contributing to Artillery? Awesome! Please have a quick look at [the
guide](CONTRIBUTING.md).

# License

**Artillery** is open-source software distributed under the terms of the
[ISC](http://en.wikipedia.org/wiki/ISC_license) license.

```
Copyright (c) 2015, Hassy Veldstra <h@veldstra.org>

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
