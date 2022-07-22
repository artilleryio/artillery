# Using cookies when testing HTTP services

This example shows you how Artillery works with cookies when testing HTTP services.

## Running the HTTP server

This example includes an Express.js application running an HTTP server.

First, install the server dependencies:

```shell
npm install
```

After installing the dependencies, start the HTTP server:

```shell
npm run app:start
```

This command will start an HTTP server listening at http://localhost:3000/.

## Running Artillery tests

This directory contains a test script (`cookies.yml`) which demonstrates the different ways to work with cookies when testing an HTTP service:

- Using cookies set by the HTTP service.
- Manually setting a custom cookie in an Artillery request.

Once the HTTP server is up and running, execute the test script:

```
artillery run cookies.yml
```
