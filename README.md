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

# Features

- Full HTTP(S) support
- Experimental WebSocket support
- 100% declarative tests scenarios (no code, just JSON)
- Detailed performance stats
- Use minigun as a standalone CLI tool or as a Node.js library
- Good performance
- Open-source & free

# Quickstart

## Install

**minigun** is available via [npm](http://npmjs.org)

`$ npm install -g minigun`

## Run

`$ minigun quick -d 30 -r 5 http://127.0.0.1:3000/test`

This will run a test for 30 seconds with an average of 5 new requests to
`http://127.0.0.1:3000/test` every second.

## Run with a more complex scenario

`$ minigun run hello.json`

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

# Use cases

- Benchmark the performance of your API or microservice as you're building it
- Ensure new code does not introduce performance regressions
- Test your code for memory leaks
- Benchmark dependencies (libraries, frameworks, external services) to get a feel for their performance characteristics before you integrate
- Run load-tests before you launch to ensure your application can meet projected demand

## Chain HTTP requests

You can parse responses and reuse those values them in subsequent requests.

In the following example, we POST to `/pets` to create a new resource, capture part
of the response (the id of the new resource) and store it in the variable `id`.
We then use that value in the subsequent request to load the resource and to
check to see if the resource we get back looks right.

```javascript
{"post":
  {
    "url": "/pets",
    "json": {"name": "Mali", "species": "dog"},
    "capture": {"json": "$.id", "as": "id"}
  }
},
{"get":
  {
    "url": "/pets/{{ id }}",
    "match": {"json": "$.name", "value": "{{ name }}"}
  }
}
```

By default, every response body is captured in the variable `$`, so the
example above could also be rewritten as:

```javascript
{"post":
  {
    "url": "/pets",
    "json": {"name": "Mali", "species": "dog"}
  }
},
{"get":
  {
    "url": "/pets/{{ $.id }}",
    "match": {"json": "$.name", "value": "{{ name }}"}
  }
}
```

**NOTE**: Only JSON is supported at the moment. Support for XML and arbitrary
regexps is in the works.

# Design

## Declarative tests

**minigun** test cases are 100% declarative. Your test-case describes _what_
needs to happen, not _how_ it happens.

Benefits of this approach:

- Tests can be 100% reproducible, since there is no custom code.
- Test cases can be auto-generated and analysed by other tools - it's just JSON.
- DSLs can be written for any language. We have a JS DSL on the roadmap, and
  one can be written easily for Ruby, Python, Lua or another language.
- Stronger performance guarantees can be made in absence of custom code.

Further reading:
- [Imperative vs Declarative Programming](http://latentflip.com/imperative-vs-declarative/)

## Statistically-sound testing

### Modeling user arrivals

**minigun** uses the [Poisson distribution](http://en.wikipedia.org/wiki/Poisson_process)
by default to model how requests are spread over the duration of the test.

**What does this mean in practice?**

If you specify a duration of 60 seconds, with the arrival rate of 10, it means
*on average* 10 users will arrive every second, with for example 8 arrivals one
second and 11 arrivals the next. The inter-arrival period would also be slightly different every time, i.e. 5 users arriving within 1 second (1000 ms) would not be evenly spread out 200ms apart.

This may seem like a subtle difference, but in practice it leads to more robust
tests.

# Contributing

Thinking of contributing to Minigun? Awesome! Please have a quick look at [the
guide](CONTRIBUTING.md).

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
