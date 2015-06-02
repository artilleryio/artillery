```
             _           _
            (_)         (_)
 _ __ ___    _   _ __    _    __ _   _   _   _ __
| '_ ` _ \  | | | '_ \  | |  / _` | | | | | | '_ \
| | | | | | | | | | | | | | | (_| | | |_| | | | | |
|_| |_| |_| |_| |_| |_| |_|  \__, |  \__,_| |_| |_|
                              __/ |
                             |___/
Load-testing for HTTP-based applications
```

**minigun** is a simple but powerful load-testing utility designed to help you make your apps more performant, reliable, and scalable.

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
        { "duration": 120, "users": 1200 }
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
