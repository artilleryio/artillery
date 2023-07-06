<p align="center">
  <img src="./github-action-icon.svg" alt="GitHub Actions icon" width="80">
</p>
<h1 align="center">Artillery GitHub Action</h1>

<p align="center">
Official GitHub Action for running load tests with <a href="https://artillery.io/">Artillery</a>.
</p>

## Inputs

The `artilleryio/run` action supports a subset of the [`run` command options](https://www.artillery.io/docs/reference/cli/run#options) of our CLI.

### `test`

A test script path.

```yml
- name: Load tests
  uses: artilleryio/run@v1
  with:
    test: ./preprod.yml
```

### `target`

- _Optional_

Set or override the target URL for the tests.

### `output`

- _Optional_, default: `./report.json`

Write the test report to the given path.

```yml
- name: Load tests
  uses: artilleryio/run@v1
  with:
    test: ./load-tests/prod.yml
    # Apply a shared Artillery configuration
    # for all the test scripts in this run.
    config: ./load-tests/artillery.config.yml
    # Generate a report for this test run.
    output: ./custom-report.json
```

### `config`

- _Optional_

A path to the shared configuration file. When provided, the configuration will merge with the existing `config` fields in individual test scripts.

```yml
- name: Load tests
  uses: artilleryio/run@v1
  with:
    test: ./load-tests/prod.yml
    # Apply a shared Artillery configuration
    # for all the test scripts in this run.
    config: ./load-tests/artillery.config.yml
```

### `insecure`

- _Optional_

Ignore TLS validation during the test run.

### `quiet`

- _Optional_

Run the tests in quiet mode.

## Outputs

### `report`

A path to the generated test run report JSON file.

```yml
- name: Load tests
  id: loadtest
  uses: artilleryio/run@v1
  with:
    test: ./test.yml

- name: Access report output
  run: echo "Load test report saved to ${{ steps.loadtest.outputs.report }}"
```

## Examples

> Make the most out of your CI/CD pipelines by reading the [Best practices](https://www.artillery.io/docs/get-started/best-practices) of load testing with Artillery.

### Load testing before deployment

In this example, we will configure GitHub Actions to run load tests before deploying changes to a pre-production environment.

```yml
name: pre-prod-deploy

on:
  push:
    branches: [main]

jobs:
  load-test:
    runs-on: ubuntu-latest
    # Make sure to use Artillery's Docker container.
    container: artilleryio/artillery:latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Load tests
        uses: artilleryio/run@v1
        with:
          # Provide the test scripts to run.
          test: ./load-tests/pre-prod.yml
          # Run the test scripts against the staging environment
          # as a quality assurance before promoting it to preprod.
          target: https://staging.myapp.com

      - name: Deploy
        run: ./deploy.sh
```

### Scheduled load test

You can take advantage of of [scheduled workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule) to run load tests periodically.

Below, we are configuring a scheduled load test of the production environment:

```yml
name: prod-load-test

on:
  schedule:
    # Run this workflow every midnight.
    - cron: "0 0 * * * "

jobs:
  load-test:
    runs-on: ubuntu-latest
    container: artilleryio/artillery:latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Load tests
        uses: artilleryio/run@v1
        with:
          test: ./prod.yml
          output: ./report.json

      - name: Upload test report
        uses: actions/upload-artifact@v2
        # Upload the test report even if the tests fail.
        if: always()
        with:
          name: artillery-test-report
          path: ./report.json
```
