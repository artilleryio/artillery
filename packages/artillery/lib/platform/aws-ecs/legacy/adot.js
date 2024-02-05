'use strict';

const { putParameter } = require('./aws-util');

const {
  assembleCollectorConfigOpts,
  parseReportersForADOT
} = require('artillery-plugin-publish-metrics');

module.exports = {
  createADOTDefinitionIfNeeded
};

async function createADOTDefinitionIfNeeded(config, context) {
  const pm = config.plugins?.['publish-metrics'];
  if (!pm) return;

  const adotRelevantConfigs = parseReportersForADOT(pm);
  if (adotRelevantConfigs.length === 0) return;

  const { collectorConfigJSON, collectorEnvVars } = assembleCollectorConfigOpts(
    adotRelevantConfigs,
    { dotenv: { ...context.dotenv } }
  );
  context.dotenv = Object.assign(context.dotenv, collectorEnvVars);
  context.adotSSMParameterPath = `/artilleryio/${context.testId}-otel-config`;
  await putParameter(
    context.adotSSMParameterPath,
    collectorConfigJSON,
    'text',
    context.region
  );
  return configureADOTSidecarDefinition(context);
}

function configureADOTSidecarDefinition(context) {
  return {
    name: 'adot-collector',
    image: 'amazon/aws-otel-collector',
    command: [
      '--config=/etc/ecs/container-insights/otel-task-metrics-config.yaml'
    ],
    secrets: [
      {
        name: 'AOT_CONFIG_CONTENT',
        valueFrom: `arn:aws:ssm:${context.region}:${context.accountId}:parameter/artilleryio/${context.testId}-adot-config`
      }
    ],
    logConfiguration: {
      logDriver: 'awslogs',
      options: {
        'awslogs-group': `${context.logGroupName}/${context.clusterName}`,
        'awslogs-region': context.region,
        'awslogs-stream-prefix': `artilleryio/${context.testId}`,
        'awslogs-create-group': 'true'
      }
    }
  };
}
