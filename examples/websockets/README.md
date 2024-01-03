# WebSockets load testing example

This example shows you how to test a [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) server using Artillery's built-in WebSockets engine.

## Running the WebSockets server

First, install the server dependencies:

```
npm install
```

After installing the dependencies, start the WebSockets server:

```
npm run server
```

This command will start a WebSockets server listening at ws://localhost:8888.

## Running Artillery test

This directory contains a test script (`test.yml`) which demonstrates different test scenarios for load testing a WebSockets implementation.

Once the WebSockets server is up and running, execute the test script:

```
npx artillery run test.yml
```
