
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgJson = require('artillery/package.json');
const DEFAULT_IMAGE_TAG = pkgJson.version;

// Default wait timeout for cloud workers to start
let WAIT_TIMEOUT_SEC = 600;

// Legacy override
if (process.env.ECS_WAIT_TIMEOUT) {
  WAIT_TIMEOUT_SEC = parseInt(process.env.ECS_WAIT_TIMEOUT, 10);
}

// Override
if (process.env.WORKER_WAIT_TIMEOUT_SEC) {
  WAIT_TIMEOUT_SEC = parseInt(process.env.WORKER_WAIT_TIMEOUT_SEC, 10);
}

export const ARTILLERY_CLUSTER_NAME = 'artilleryio-cluster';
export const TASK_NAME = 'artilleryio-loadgen-worker';
export const SQS_QUEUES_NAME_PREFIX = 'artilleryio_test_metrics';
export const S3_BUCKET_NAME_PREFIX = 'artilleryio-test-data';
export const LOGGROUP_NAME = 'artilleryio-log-group';
export const LOGGROUP_RETENTION_DAYS =
  process.env.ARTILLERY_LOGGROUP_RETENTION_DAYS || 180;
export const IMAGE_VERSION = process.env.ECR_IMAGE_VERSION || DEFAULT_IMAGE_TAG;
export const WAIT_TIMEOUT = WAIT_TIMEOUT_SEC;
export const TEST_RUNS_MAX_TAGS =
  parseInt(process.env.TEST_RUNS_MAX_TAGS, 10) || 8;