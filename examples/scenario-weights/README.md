# Setting scenario weights

This example shows how you can modify how Artillery selects a scenario for a virtual user during load testing. In Artillery, each VU will be assigned to one of the defined scenarios. By default, each scenario has a weight of 1, meaning each scenario has the same probability of getting assigned to a VU. By specifying a weight in a scenario, you'll increase the chances of Artillery assigning the scenario for a VU. The probability of a scenario getting chosen depends on the total weight for all scenarios.

To learn more, read the Artillery documentation on scenario weights: https://artillery.io/docs/guides/guides/test-script-reference.html#Scenario-weights

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

This directory contains a test script (`scenario-weights.yml`) which demonstrates how to set different scenario weights.

Once the HTTP server is up and running, execute the test script:

```
artillery run scenario-weights.yml
```
