```
             _           _
            (_)         (_)
 _ __ ___    _   _ __    _    __ _   _   _   _ __
| '_ ` _ \  | | | '_ \  | |  / _` | | | | | | '_ \
| | | | | | | | | | | | | | | (_| | | |_| | | | | |
|_| |_| |_| |_| |_| |_| |_|  \__, |  \__,_| |_| |_|
                              __/ |
                             |___/
```

**minigun** is a simple but powerful load-testing tool designed to help you
make your apps more performant, reliable, and scalable.

Made by [@hveldstra](https://twitter.com/hveldstra) - please @-message me with
feedback and suggestions!

# Quickstart

## Install

**minigun** is available via [npm](http://npmjs.org)

`npm install -g minigun`

## Run

`minigun run hello.json`

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
        { "get": {"url": "/test"}}
      ]
    }
  ]
}
```

# Features

- Full HTTP(S) support
- WebSocket support
- 100% declarative tests scenarios (no code, just JSON)
- Detailed performance stats
- Use minigun as a standalone CLI tool or as a Node.js library
- Good performance
- Open-source & free

# Use cases

- Benchmark the performance of your API or microservice as you're building it
- Ensure new code does not introduce performance regressions or memory leaks before releasing into staging
- Show that the code you're about to ship satisfies performance requirements
- Run a performance benchmark for a framework or library you're considering using to get a feel for its performance characteristics

# Design

## Declarative tests

**minigun** test cases are 100% declarative. Your test-case describes _what_
needs to happen, not _how_ it happens.

Benefits of this approach:

- Tests can be 100% reproducible, since there is no custom code.
- Test cases can be auto-generated and statically analysed by other tools.
- DSLs can be written for any language. We have a JS DSL on the roadmap, and
  one can be written easily for Ruby, Python, Lua or another language.
- Stronger performance guarantees can be made in absence of custom code.

Further reading:
- [Imperative vs Declarative Programming](http://latentflip.com/imperative-vs-declarative/)

## Statistically-sound testing

### Modeling user arrivals

**minigun** uses the [Poisson distribution](http://en.wikipedia.org/wiki/Poisson_process)
by default to model how requests are spread over the duration of the test. This a
statistically more sound way to model real-world behavior than distributing
requests evenly, which is what most other load-testing tools do.

**What does this mean in practice?**

If you specify a duration of 60 seconds, with the arrival rate of 10, it means
*on average* 10 users will arrive every second, with for example 8 arrivals one
second and 11 arrivals the next. The inter-arrival period would also be slightly
different every time, i.e. 8 users arriving over 1 second (1000 ms) would not
be evenly spread out 125ms apart.

This may seem like a subtle difference, but in practice it leads to more robust
tests.

### Reported stats

**minigun** aims to give you only meaningful and actionable measurements.

#### No averages

Averages are useless because they are meaningless. In a typical application,
outliers will drag the average up - even more so under load.

#### Percentiles

Knowing that the average response time is 300ms doesn't actually tell you
anything. What's far more useful to know is that 95% of all requests complete
in 280ms or less.

# Further Reading

Coming soon

# License

**minigun** is 100% open-source software distributed under the terms of the [ISC](http://en.wikipedia.org/wiki/ISC_license) license.

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
