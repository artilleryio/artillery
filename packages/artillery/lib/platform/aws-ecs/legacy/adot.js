'use strict';

const { putParameter } = require('./aws-util');

const {
  assembleCollectorConfigOpts
} = require('artillery-plugin-publish-metrics');

module.exports = {
  createADOTDefinitionIfNeeded
};

async function createADOTDefinitionIfNeeded(context) {
  const config = context.fullyResolvedConfig;
  const publishMetricsConfig = config.plugins?.['publish-metrics'];
  if (!publishMetricsConfig) return;

  const collectorOpts = assembleCollectorConfigOpts(publishMetricsConfig, {
    dotenv: { ...context.dotenv }
  });
  if (!collectorOpts) return;

  context.dotenv = Object.assign(context.dotenv || {}, collectorOpts.envVars);
  context.adotSSMParameterPath = `/artilleryio/OTEL_CONFIG_${context.testId}`;

  await putParameter(
    context.adotSSMParameterPath,
    collectorOpts.configJSON,
    'String',
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
        valueFrom: `arn:aws:ssm:${context.region}:${context.accountId}:parameter${context.adotSSMParameterPath}`
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
