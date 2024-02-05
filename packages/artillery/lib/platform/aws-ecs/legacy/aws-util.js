const AWS = require('aws-sdk');
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
async function ecsDescribeTasks(params, ecs) {
  const taskArnChunks = splitIntoSublists(params.tasks, 100);
  const results = { tasks: [], failures: [] };
  for (let i = 0; i < taskArnChunks.length; i++) {
    const params2 = Object.assign({}, params, { tasks: taskArnChunks[i] });
    try {
      const ecsData = await ecs.describeTasks(params2).promise();
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
  if (region) AWS.config.update({ region });

  try {
    const exists = await parameterExists(ssmPath);
    if (exists) {
      return Promise.resolve();
    }
    return putParameter(ssmPath, defaultValue, type);
  } catch (err) {
    return Promise.reject(err);
  }
}

async function parameterExists(path, region) {
  if (region) AWS.config.update({ region });
  const ssm = new AWS.SSM({ apiVersion: '2014-11-06' });
  const getParams = {
    Name: path,
    WithDecryption: true
  };

  try {
    const ssmResponse = await ssm.getParameter(getParams).promise();
    return Promise.resolve(true);
  } catch (ssmErr) {
    if (ssmErr.code === 'ParameterNotFound') {
      return Promise.resolve(false);
    } else {
      return Promise.reject(ssmErr);
    }
  }
}

async function putParameter(path, value, type, region) {
  if (region) AWS.config.update({ region });
  const ssm = new AWS.SSM({ apiVersion: '2014-11-06' });

  const putParams = {
    Name: path,
    Type: type,
    Value: value,
    Overwrite: true
  };

  try {
    const ssmResponse = await ssm.putParameter(putParams).promise();
    return Promise.resolve();
  } catch (ssmErr) {
    return Promise.reject(ssmErr);
  }
}

async function getParameter(path, region) {
  if (region) {
    AWS.config.update({ region });
  }

  const ssm = new AWS.SSM({ apiVersion: '2014-11-06' });

  try {
    const ssmResponse = await ssm
      .getParameter({
        Name: path,
        WithDecryption: true
      })
      .promise();

    debug({ ssmResponse });
    return ssmResponse.Parameter && ssmResponse.Parameter.Value;
  } catch (ssmErr) {
    if (ssmErr.code === 'ParameterNotFound') {
      return false;
    } else {
      throw ssmErr;
    }
  }
}

async function deleteParameter(path, region) {
  if (region) {
    AWS.config.update({ region });
  }

  const ssm = new AWS.SSM({ apiVersion: '2014-11-06' });

  try {
    const ssmResponse = await ssm
      .deleteParameter({
        Name: path
      })
      .promise();

    debug({ ssmResponse });
    return ssmResponse;
  } catch (ssmErr) {
    if (ssmErr.code === 'ParameterNotFound') {
      return false;
    } else {
      throw ssmErr;
    }
  }
}