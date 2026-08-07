import {
  DescribeTasksCommand,
  ECSClient,
  type Failure,
  type Task
} from '@aws-sdk/client-ecs';
import type { ParameterType } from '@aws-sdk/client-ssm';
import {
  DeleteParameterCommand,
  GetParameterCommand,
  PutParameterCommand,
  SSMClient
} from '@aws-sdk/client-ssm';
import createDebug from 'debug';

const debug = createDebug('util');

export {
  ecsDescribeTasks,
  ensureParameterExists,
  parameterExists,
  putParameter,
  getParameter,
  deleteParameter
};
// Wraps ecs.describeTasks to support more than 100 task ARNs in params.tasks
async function ecsDescribeTasks(
  params: { tasks: string[]; [key: string]: any },
  region: string
) {
  const ecs = new ECSClient({ apiVersion: '2014-11-13', region });
  const taskArnChunks = splitIntoSublists(params.tasks, 100);
  const results: { tasks: Task[]; failures: Failure[] } = {
    tasks: [],
    failures: []
  };
  for (let i = 0; i < taskArnChunks.length; i++) {
    const params2 = Object.assign({}, params, { tasks: taskArnChunks[i] });
    const ecsData = await ecs.send(new DescribeTasksCommand(params2));
    results.tasks = results.tasks.concat(ecsData.tasks ?? []);
    results.failures = results.failures.concat(ecsData.failures ?? []);
  }
  return results;
}

// Slice input list into several lists, where each list has no more than maxGroupSize elements
function splitIntoSublists<T>(list: T[], maxGroupSize: number): T[][] {
  const result: T[][] = [];
  const numGroups = Math.ceil(list.length / maxGroupSize);
  for (let i = 0; i < numGroups; i++) {
    result.push(list.slice(i * maxGroupSize, i * maxGroupSize + maxGroupSize));
  }
  return result;
}

// ********************
// AWS SSM helpers
// In future these will be parameter-store agnostic, and work with Kubernetes
// ConfigMaps or Azure/GCP native equivalents.
// ********************

// If parameter exists, do nothing; otherwise set the value
async function ensureParameterExists(
  ssmPath: string,
  defaultValue: string,
  type: ParameterType | string,
  region: string
) {
  const exists = await parameterExists(ssmPath, region);
  if (exists) {
    return;
  }
  return putParameter(ssmPath, defaultValue, type, region);
}

async function parameterExists(path: string, region: string) {
  const ssm = new SSMClient({ apiVersion: '2014-11-06', region });
  const getParams = {
    Name: path,
    WithDecryption: true
  };

  try {
    await ssm.send(new GetParameterCommand(getParams));
    return true;
  } catch (ssmErr) {
    if ((ssmErr as Error).name === 'ParameterNotFound') {
      return false;
    } else {
      throw ssmErr;
    }
  }
}

async function putParameter(
  path: string,
  value: string,
  type: ParameterType | string,
  region: string
) {
  const ssm = new SSMClient({ apiVersion: '2014-11-06', region });

  const putParams = {
    Name: path,
    Type: type as ParameterType,
    Value: value,
    Overwrite: true
  };

  await ssm.send(new PutParameterCommand(putParams));
}

async function getParameter(path: string, region: string) {
  const ssm = new SSMClient({ apiVersion: '2014-11-06', region });

  try {
    const ssmResponse = await ssm.send(
      new GetParameterCommand({
        Name: path,
        WithDecryption: true
      })
    );

    debug({ ssmResponse });
    return ssmResponse.Parameter?.Value;
  } catch (ssmErr) {
    if ((ssmErr as Error).name === 'ParameterNotFound') {
      return false;
    } else {
      throw ssmErr;
    }
  }
}

async function deleteParameter(path: string, region: string) {
  const ssm = new SSMClient({ apiVersion: '2014-11-06', region });

  try {
    const ssmResponse = await ssm.send(
      new DeleteParameterCommand({
        Name: path
      })
    );

    debug({ ssmResponse });
    return ssmResponse;
  } catch (ssmErr) {
    if ((ssmErr as Error).name === 'ParameterNotFound') {
      return false;
    } else {
      throw ssmErr;
    }
  }
}
