# Load Testing With Artillery and Jenkins

This repo contains an example for running [Artillery](https://artillery.io/) load tests on Jenkins.

For more details, read the ["Integrating Artillery with Jenkins"](https://artillery.io/docs/guides/integration-guides/jenkins.html) section in the Artillery documentation.

## Artillery test script

The [example Artillery script](tests/performance/socket-io.yml) will test a running Socket.IO server. You can run the test script and see it in action: https://repl.artillery.io/?s=4ae41a53-1fa7-4256-9d1c-2a80202c1ca2&hR=true

## Jenkins Pipline

The [included Jenkins Pipeline configuration](Jenkinsfile) is set up to run the load test on a schedule every day at 12:00 AM (based on the Jenkins server timezone). The Pipeline will also generate an HTML report and store the artifact for later retrieval.
