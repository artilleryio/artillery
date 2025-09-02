const { ECSClient, DescribeTasksCommand } = require('@aws-sdk/client-ecs');
const {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
  DeleteParameterCommand
} = require('@aws-sdk/client-ssm');
const debug = require('debug')('util');

module.exports = {
  // ECS:
  ecsDescribeTasks,

  // AWS SSM:
  ensureParameterExists,
  parameterExists,
  putParameter,
  getParameter,
  deleteParameter
};

// Wraps ecs.describeTasks to support more than 100 task ARNs in params.tasks
async function ecsDescribeTasks(params, region) {
  const ecs = new ECSClient({ apiVersion: '2014-11-13', region });
  const taskArnChunks = splitIntoSublists(params.tasks, 100);
  const results = { tasks: [], failures: [] };
  for (let i = 0; i < taskArnChunks.length; i++) {
    const params2 = Object.assign({}, params, { tasks: taskArnChunks[i] });
    try {
      const ecsData = await ecs.send(new DescribeTasksCommand(params2));
      results.tasks = results.tasks.concat(ecsData.tasks);
      results.failures = results.failures.concat(ecsData.failures);
    } catch (err) {
      throw err;
    }
  }
  return results;
}

// Slice input list into several lists, where each list has no more than maxGroupSize elements
function splitIntoSublists(list, maxGroupSize) {
  const result = [];
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
async function ensureParameterExists(ssmPath, defaultValue, type, region) {
  try {
    const exists = await parameterExists(ssmPath, region);
    if (exists) {
      return;
    }
    return putParameter(ssmPath, defaultValue, type, region);
  } catch (err) {
    throw err;
  }
}

async function parameterExists(path, region) {
  const ssm = new SSMClient({ apiVersion: '2014-11-06', region });
  const getParams = {
    Name: path,
    WithDecryption: true
  };

  try {
    await ssm.send(new GetParameterCommand(getParams));
    return true;
  } catch (ssmErr) {
    if (ssmErr.name === 'ParameterNotFound') {
      return false;
    } else {
      throw ssmErr;
    }
  }
}

async function putParameter(path, value, type, region) {
  const ssm = new SSMClient({ apiVersion: '2014-11-06', region });

  const putParams = {
    Name: path,
    Type: type,
    Value: value,
    Overwrite: true
  };

  await ssm.send(new PutParameterCommand(putParams));
}

async function getParameter(path, region) {
  const ssm = new SSMClient({ apiVersion: '2014-11-06', region });

  try {
    const ssmResponse = await ssm.send(
      new GetParameterCommand({
        Name: path,
        WithDecryption: true
      })
    );

    debug({ ssmResponse });
    return ssmResponse.Parameter && ssmResponse.Parameter.Value;
  } catch (ssmErr) {
    if (ssmErr.name === 'ParameterNotFound') {
      return false;
    } else {
      throw ssmErr;
    }
  }
}

async function deleteParameter(path, region) {
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
    if (ssmErr.name === 'ParameterNotFound') {
      return false;
    } else {
      throw ssmErr;
    }
  }
}
