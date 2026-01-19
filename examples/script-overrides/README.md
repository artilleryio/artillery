# Overriding values dynamically

This example shows how values in an Artillery script can be changed dynamically.

A typical use-case is running Artillery in CI and being able to change the load generated dynamically, e.g. by overriding Input Parameters to a job in Jenkins or AWS CodeBuild.


The example test script defines 3 environments with different load phases:

- `smoke` - a low TPS short phase for smoke testing, with hardcoded values
- `preprod` - a higher TPS longer phase for preprod testing, with hardcoded values
- `dynamic` - a load phase that can be set at runtime

## Running the example

Run the test at low TPS with the `smoke` config environment:

```sh
npx artillery run -e smoke test.yaml
```

Run the test at higher TPS with the `preprod` environment:

```sh
npx artillery run -e preprod test.yaml
```

If the test script is used in a Jenkins job, those environment names could be an input themselves to allow the user to choose between pre-configured load profiles.

Finally, to override the load phase completely at runtime we need to set `ARRIVAL_RATE` and `DURATION` environment variables before running Artillery, such as:

```sh
ARRIVAL_RATE=20 DURATION=600 artillery run -e dynamic test.yaml
```
