# loadgen-worker (Node.js)

Worker that runs inside the Fargate/ACI container image. Source in
`src/*.ts`, compiled by the existing `tsc -p tsconfig.build.json` step
into `dist/`. `loadgen-worker` (extensionless file in this dir) is a CJS
shim: ECS task definitions hardcode `/artillery/loadgen-worker` as the
container entryPoint; the shim imports the compiled ESM output.

## Contracts

Log line formats, queue message shapes, storage keys and exit codes are
consumed by the controller (`legacy/run-cluster.ts`, `legacy/sqs-reporter.ts`,
`az/aci.ts`) and by e2e tests. Do not change without checking both sides.
Note: `workerError.exitCode` is a JSON string on purpose.

Exit codes: 0 ok; 3 empty bundle; 4 synced-marker upload failed;
5 go/node_modules.zip wait timeout; 6 CLI error (also unexpected worker
errors); 7 interrupted; 10 bad args / dep install failure; 12 heartbeat
timeout; 21 CLI ensure/expect failure (passed through).

## Local run (no Docker)

Node >= 24 runs the TS sources directly:

```sh
cd packages/artillery
IS_LEADER=true \
WORKER_ID_OVERRIDE=local1 \
ARTILLERY_BINARY="$(pwd)/bin/run" \
node lib/platform/aws-ecs/worker/src/index.ts \
  -p "s3://<bucket>/tests/<testId>" \
  -a "$(node -e 'console.log(Buffer.from(JSON.stringify(["run","test.yml"])).toString("base64"))')" \
  -r eu-west-1 \
  -q "https://sqs.eu-west-1.amazonaws.com/<acct>/artilleryio_test_metrics_<id>.fifo" \
  -i "<testId>" \
  -d "s3://<bucket>/test-runs" \
  -t 600
```

Needs AWS creds in the environment. Simulate the controller by writing
`test-runs/<id>/go.json` and `test-runs/<id>/heartbeat.json` (epoch-ms
string, refresh < every 180s) to S3 and consuming the SQS queue.
Test data dir is `$PWD/test_data`.

Azure path: `-z yes -p <blobContainer>` plus `AQS_QUEUE_NAME`,
`AZURE_STORAGE_ACCOUNT`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET` env vars.
