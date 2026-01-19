# SOAP Load Testing Example

Artillery doesn't have an official SOAP engine, but it's still possible to test SOAP with it. While building [a dedicated engine](https://www.artillery.io/blog/extend-artillery-by-creating-your-own-engines) is one option, you can also use custom functions and leverage the existing HTTP engine. This example shows you how to do that.

## What the example does

This example calls the SOAP server by using a SOAP client (node-soap) in a custom function. That custom function gets called with each VU execution. We also emit [custom metrics](https://www.artillery.io/docs/reference/extension-apis#custom-metrics-api) from the function to track the number of requests and responses, as well as the time taken to make the SOAP request.

```
soap.addNumbers.requests: ...................................................... 8
soap.addNumbers.response_time:
  min: ......................................................................... 2
  max: ......................................................................... 9
  mean: ........................................................................ 4.9
  median: ...................................................................... 2
  p95: ......................................................................... 7.9
  p99: ......................................................................... 7.9
soap.addNumbers.responses: ..................................................... 8
```

Notes:
- The `callSoapOperation` function has been abstracted to allow calling other operations, should you wish to extend this example.
- The creation of the client is also cached to prevent creating it for every virtual user.

## Running the SOAP server

We provide a very simple SOAP server for this example, containing the `AddNumbersService` with a single `addNumbers` operation.

First, install the server dependencies:

```
cd server && npm install
```

After installing the dependencies, start the SOAP server:

```
node app.js
```

This command will start a Socket.IO server listening at http://localhost:8000/.

## Running Artillery test

Once the SOAP server is up and running, execute the test script:

```
npx artillery run soap.yml
```
