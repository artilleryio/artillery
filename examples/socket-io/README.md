# Socket.IO load testing example

This example shows you how to test a [Socket.IO](https://socket.io/) server using Artillery's built-in Socket.IO engine.

## Running the Socket.IO server

First, install the server dependencies:

```
npm install
```

After installing the dependencies, start the Socket.IO server:

```
node app.js
```

This command will start a Socket.IO server listening at http://localhost:3000/.

## Running Artillery test

This directory contains a test script (`socket-io.yml`) which demonstrates different test scenarios for load testing a Socket.IO implementation.

Once the Socket.IO server is up and running, execute the test script:

```
artillery run socket-io.yml
```
