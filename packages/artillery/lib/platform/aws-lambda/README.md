# Lambda

Lambda packages Artillery and dependencies as `.zip` files by default. However, this has [several limitations](https://www.artillery.io/docs/load-testing-at-scale/aws-lambda#unavailable-artillery-features). To address this, we have introduced experimental support for using Lambda Container Images.

When using the `--container` flag, the Lambda function created by Artillery will use a Docker container, and install your custom dependencies at runtime. After the function is first created for that version, it will reuse that same function for every subsequent execution, making startup times improve to only a few seconds.

## Instructions

### Canary

Currently this feature is available in a canary version. Contact Artillery for the right canary version and install it.

### ECR Image Replication

As AWS doesn't support Public ECR images with Lambda, you will need to host Artillery's Lambda Worker image in your own Private ECR.

To do that, you must:
1. Create an ECR Private Repo called `artillery-worker` in the region you want to run the script in.
2. (Optional) Set up automatic cross-region replication by going to Private registry -> Settings -> Replication, and creating a new rule (Add rule) for setting cross-region replication, selecting the regions you want to run tests from. Alternatively, you can simply run the commands here for each region you want.
3. Make sure to set the necessary environment variables:

```shell
export WORKER_VERSION=abc123 #provided by Artillery team
export ARTILLERY_VERSION=x.y.z-abc123 #provided by Artillery team
export AWS_ACCOUNT_ID=123456778 #the AWS account ID where the ECR repo is (must be the same as tests)
export AWS_REGION=your-region #the region where the ECR repo is
```

4. Run the following commands in your shell:

```shell
#!/bin/bash

# Variables
public_repo_uri="public.ecr.aws/d8a4z9o5/artillery-worker:${WORKER_VERSION}"
private_repo_uri="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/artillery-worker:${ARTILLERY_VERSION}"

# Pull the image from Artillery's public ECR
docker pull $public_repo_uri

# Tag the image for the private ECR
docker tag $public_repo_uri $private_repo_uri

# AWS login for private ECR
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Push the image to the private ECR
docker push $private_repo_uri
```

### Running the test

You should now be able to run the tests from the AWS regions where you pushed/replicated the image to:

`artillery run-lambda <SCENARIO> --container`

### New version

When a new Artillery version is available, repeat the instructions in this README to host the new image version.