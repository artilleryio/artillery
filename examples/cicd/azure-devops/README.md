# Load Testing With Artillery and Azure DevOps

This repo contains an example for running [Artillery](https://artillery.io/) load tests on [Azure DevOps](https://azure.microsoft.com/en-us/services/devops/) using [Azure Pipelines](https://azure.microsoft.com/en-us/services/devops/pipelines/).

For more details, read the ["Integrating Artillery with Azure DevOps"](https://artillery.io/docs/guides/integration-guides/azure-devops.html) section in the Artillery documentation.

## Artillery test script

The [example Artillery script](tests/performance/socket-io.yml) will test a running Socket.IO server. You can run the test script and see it in action: https://repl.artillery.io/?s=4ae41a53-1fa7-4256-9d1c-2a80202c1ca2&hR=true

## Azure Pipelines setup

The [included Azure Pipelines YAML file](azure-pipelines.yml) will trigger the load test after any code push to the `main` branch of the repository, and is set up to run on a schedule every day at 12:00 AM (UTC). The setup will also generate an HTML report and store the artifact for later retrieval.
