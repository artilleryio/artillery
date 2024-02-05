const AWS = require('aws-sdk');
const debug = require('debug')('artillery:aws-cloudwatch');

const allowedRetentionDays = [
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827,
  2192, 2557, 2922, 3288, 3653
];

async function _putCloudwatchRetentionPolicy(logGroupName, retentionInDays) {
  const cloudwatchlogs = new AWS.CloudWatchLogs({ apiVersion: '2014-11-06' });
  const putRetentionPolicyParams = {
    logGroupName,
    retentionInDays
  };

  return cloudwatchlogs.putRetentionPolicy(putRetentionPolicyParams).promise();
}

function setCloudwatchRetention(
  logGroupName,
  retentionInDays,
  options = { maxRetries: 5, waitPerRetry: 1000 }
) {
  if (!allowedRetentionDays.includes(retentionInDays)) {
    console.log(
      `WARNING: Skipping setting Cloudwatch retention, as invalid value specified: ${retentionInDays}. Allowed values are: ${allowedRetentionDays.join(
        ', '
      )}`
    );
    return;
  }

  const interval = setInterval(
    async (opts) => {
      debug(
        `Trying to set Cloudwatch Log group ${logGroupName} retention policy to ${retentionInDays} days`
      );
      opts.incr = (opts.incr || 0) + 1;

      try {
        const res = await _putCloudwatchRetentionPolicy(
          logGroupName,
          retentionInDays
        );
        debug(
          `Successfully set Cloudwatch Logs retention policy to ${retentionInDays} days`
        );
        clearInterval(interval);
      } catch (error) {
        if (error & (error.code != 'ResourceNotFoundException')) {
          console.log('WARNING: Unexpected error setting retention policy:');
          console.log(error);
          clearInterval(interval);
        }

        if (opts.incr >= opts.maxRetries) {
          console.log('WARNING: Max retries exceeded setting retention policy');
          console.log(error);
          clearInterval(interval);
        }
      }
    },
    options.waitPerRetry,
    options
  );

  return interval;
}

module.exports = {
  setCloudwatchRetention
};