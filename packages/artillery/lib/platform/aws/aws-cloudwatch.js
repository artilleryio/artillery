const {
  CloudWatchLogsClient,
  PutRetentionPolicyCommand
} = require('@aws-sdk/client-cloudwatch-logs');
const debug = require('debug')('artillery:aws-cloudwatch');

const allowedRetentionDays = [
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827,
  2192, 2557, 2922, 3288, 3653
];

async function _putCloudwatchRetentionPolicy(
  logGroupName,
  retentionInDays,
  region
) {
  const cloudwatchlogs = new CloudWatchLogsClient({
    apiVersion: '2014-11-06',
    region
  });
  const putRetentionPolicyParams = {
    logGroupName,
    retentionInDays
  };

  return cloudwatchlogs.send(
    new PutRetentionPolicyCommand(putRetentionPolicyParams)
  );
}

function setCloudwatchRetention(
  logGroupName,
  retentionInDays,
  region,
  options = { maxRetries: 5, waitPerRetry: 1000 }
) {
  if (!allowedRetentionDays.includes(retentionInDays)) {
    console.log(
      `WARNING: Skipping setting CloudWatch retention, as invalid value specified: ${retentionInDays}. Allowed values are: ${allowedRetentionDays.join(
        ', '
      )}`
    );
    return;
  }

  const interval = setInterval(
    async (opts) => {
      debug(
        `Trying to set CloudWatch Log group ${logGroupName} retention policy to ${retentionInDays} days`
      );
      opts.incr = (opts.incr || 0) + 1;

      try {
        const res = await _putCloudwatchRetentionPolicy(
          logGroupName,
          retentionInDays,
          region
        );
        debug(
          `Successfully set CloudWatch Logs retention policy to ${retentionInDays} days`
        );
        clearInterval(interval);
      } catch (error) {
        const resumeTestMessage =
          'The test will continue without setting the retention policy.';
        if (error?.code == 'AccessDeniedException') {
          console.log(`\n${error.message}`);
          console.log(
            '\nWARNING: Missing logs:PutRetentionPolicy permission to set CloudWatch retention policy. Please ensure the IAM role has the necessary permissions:\nhttps://docs.art/fargate#iam-permissions'
          );
          console.log(`${resumeTestMessage}\n`);
          clearInterval(interval);
          return;
        }

        if (error?.code != 'ResourceNotFoundException') {
          console.log(`\n${error.message}`);
          console.log(
            '\nWARNING: Unexpected error setting CloudWatch retention policy\n'
          );
          console.log(`${resumeTestMessage}\n`);
          clearInterval(interval);
          return;
        }

        if (opts.incr >= opts.maxRetries) {
          console.log(`\n${error.message}`);
          console.log(
            `\nWARNING: Cannot find log group ${logGroupName}\nMax retries exceeded setting CloudWatch retention policy:`
          );
          console.log(`${resumeTestMessage}\n`);
          clearInterval(interval);
          return;
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
