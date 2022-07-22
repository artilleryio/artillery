# Load Testing With Artillery and GitLab CI/CD

This repo contains an example for running [Artillery](https://artillery.io/) load tests on GitLab CI/CD.

For more details, read the ["Integrating Artillery with GitLab CI/CD"](https://artillery.io/docs/guides/integration-guides/gitlab-ci-cd.html) section in the Artillery documentation.

## Artillery test script

The [example Artillery script](tests/performance/socket-io.yml) will test a running Socket.IO server. You can run the test script and see it in action: https://repl.artillery.io/?s=4ae41a53-1fa7-4256-9d1c-2a80202c1ca2&hR=true

## GitHub Actions workflow

The [included GitLab CI/CD configuration file](.gitlab-ci.yml) will trigger the load test after any code push to the repository, generate an HTML report and store the artifact for later retrieval.
