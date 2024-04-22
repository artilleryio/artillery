#!/bin/sh
# if [ -z "${AWS_LAMBDA_RUNTIME_API}" ]; then 
  # exec /usr/local/bin/aws-lambda-rie /usr/bin/npx aws-lambda-ric $1
# else
# exec /usr/bin/npx aws-lambda-ric $1
# fi

## if ARTILLERY_WORKER_TYPE is set to "lambda" then the following command is executed
# /usr/bin/npx aws-lambda-ric $1

if [ $ARTILLERY_WORKER_PLATFORM = "aws:lambda" ]; then
  exec /usr/bin/npx aws-lambda-ric index.handler
fi

if [ $ARTILLERY_WORKER_PLATFORM = "aws:fargate" ]; then
  exec sh /artillery/loadgen-worker
fi