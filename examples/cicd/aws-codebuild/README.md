# Load Testing With Artillery and AWS CodeBuild

This repo contains an example for running [Artillery](https://artillery.io/) load tests on AWS CodeBuild.

For more details, read the ["Integrating Artillery with AWS CodeBuild"](https://artillery.io/docs/guides/integration-guides/aws-codebuild.html) section in the Artillery documentation.

## Artillery test script

The [example Artillery script](tests/performance/socket-io.yml) will test a running Socket.IO server. You can run the test script and see it in action: https://repl.artillery.io/?s=4ae41a53-1fa7-4256-9d1c-2a80202c1ca2&hR=true

## AWS CodeBuild buildspec

The [included AWS CodeBuild buildspec configuration file](buildspec.yml) is set up to run the load test, generate an HTML report, and store the artifact in an S3 bucket for later retrieval. You can also schedule the load test to run on a recurring schedule using Amazon EventBridge, as explained in the Artillery documentation.
