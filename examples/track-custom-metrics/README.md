# Tracking custom metrics example

This example shows you how to track custom metrics when testing an API using Artillery's built-in HTTP engine.

## Running the API server

First, install the server dependencies:

```
npm install
```

After installing the dependencies, start the API server:

```
node app.js
```

This command will start a server listening at http://localhost:3000/.

## Running Artillery test

This directory contains a test script (`custom-metrics.yml`) which loads a custom JS function to track of two custom metrics using an `afterResponse` hook:

- A counter to keep track of the number of requests made.
- A histogram of the request latency returned via a response header.

Once the API server is up and running, execute the test script:

```
artillery run custom-metrics.yml
```
