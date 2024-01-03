# Socket.IO load testing example

This example shows you how to test a [Socket.IO](https://socket.io/) server using Artillery's built-in Socket.IO engine.

⚠️ _**Note:** This Socket.IO server in this example uses Socket.IO v3.x, as the official Artillery engine now uses 3.x. For extended v3.x support, check out the [artillery-engine-socketio-v3 plugin](https://github.com/ptejada/artillery-engine-socketio-v3)._

## Running the Socket.IO server

First, install the server dependencies:

```
npm install
```

After installing the dependencies, start the Socket.IO server:

```
node app.js
```

This command will start a Socket.IO server listening at http://localhost:8080/.

## Running Artillery test

This directory contains a test script (`socket-io.yml`) which demonstrates different test scenarios for load testing a Socket.IO implementation.

Once the Socket.IO server is up and running, execute the test script:

```
npx artillery run socket-io.yml
```
