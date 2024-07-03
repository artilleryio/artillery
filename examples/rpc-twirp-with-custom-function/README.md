# Load testing an RPC service created with Twirp

[Twirp](https://github.com/twitchtv/twirp) is a simple RPC framework for service-to-service communication. In the following example, we will use the clients auto-generated from [Twirpscript](https://github.com/tatethurston/TwirpScript), a NodeJS implementation of Twirp, to load test a server using Twirp.

While we could build [a dedicated engine](https://www.artillery.io/blog/extend-artillery-by-creating-your-own-engines), you can also use custom functions and leverage the existing default engine. This example shows you how to do that.

## Pre-requisites

- Protobuf [installed](https://github.com/tatethurston/TwirpScript?tab=readme-ov-file#installation-)

## How the example works

This example imports the auto-generated `.pb.js` file into a processor, and calls the `MakeHat` client method, which will call the server. We also emit [custom metrics](https://www.artillery.io/docs/reference/extension-apis#custom-metrics-api) from the function to track the number of requests and responses, as well as the time taken in the RPC call.

```
twirp.requests: ................................................................ 300
twirp.response_time:
  min: ......................................................................... 1.1
  max: ......................................................................... 60.7
  mean: ........................................................................ 5.4
  median: ...................................................................... 2.2
  p95: ......................................................................... 22.4
  p99: ......................................................................... 55.2
twirp.responses: ............................................................... 300
twirp.responses.success: ....................................................... 300
```

## Running the Twirp server

First, install the dependencies:
```
cd twirp && npm install
```

Then, start the server with `npm start`

## Running Artillery test

Once the server is up and running, execute the test script:

```
npx artillery run ./test/scenario.yml
```
