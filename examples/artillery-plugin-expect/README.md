# Functional testing on Artillery

This example shows you how to run both load and functional tests with a single Artillery test script using the `artillery-plugin-expect` plugin.

## Running the API server

This example includes an Express.js application running an HTTP API using an in-memory SQLite 3 database.

First, install the server dependencies:

```shell
npm install
```

After installing the dependencies, start the API server:

```shell
node app.js
```

This command will start a server listening at http://localhost:3000/.

## Installing the `artillery-plugin-expect` plugin

To run functional tests, you'll need to install the `artillery-plugin-expect` plugin globally, which adds expectations and assertions to your test scenarios:

```shell
npm install -g artillery-plugin-expect@latest
```

## Running Artillery tests

This directory contains a test script (`functional-load-tests.yml`) which defines two environments:

- `load`: Contains a load phase that generates 25 virtual users per second for 10 minutes.
- `functional`: Contains a load phase that generates a single virtual user, and enables the `artillery-plugin-expect` plugin.

Once the plugin is installed and API server is up and running, you can run either load tests or functional tests using the same test script, using the `--environment` flag.

To run load tests:

```shell
artillery run --environment load functional-load-tests.yml
```

To run functional tests:

```shell
artillery run --environment functional functional-load-tests.yml
```
