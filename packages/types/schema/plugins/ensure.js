const Joi = require('joi');

const {
  artilleryStringNumber,
  artilleryStringBoolean
} = require('../joi.helpers');

const EnsureLegacyOptions = {
  min: artilleryStringNumber
    .meta({ title: 'Min' })
    .description(
      'Legacy Basic Check\nhttps://www.artillery.io/docs/reference/extensions/ensure#basic-checks'
    ),
  max: artilleryStringNumber
    .meta({ title: 'Max' })
    .description(
      'Legacy Basic Check\nhttps://www.artillery.io/docs/reference/extensions/ensure#basic-checks'
    ),
  median: artilleryStringNumber
    .meta({ title: 'Median' })
    .description(
      'Legacy Basic Check\nhttps://www.artillery.io/docs/reference/extensions/ensure#basic-checks'
    ),
  p95: artilleryStringNumber
    .meta({ title: 'P95' })
    .description(
      'Legacy Basic Check\nhttps://www.artillery.io/docs/reference/extensions/ensure#basic-checks'
    ),
  p99: artilleryStringNumber
    .meta({ title: 'P99' })
    .description(
      'Legacy Basic Check\nhttps://www.artillery.io/docs/reference/extensions/ensure#basic-checks'
    ),
  maxErrorRate: artilleryStringNumber
    .meta({ title: 'Max Error Rate' })
    .description(
      'Legacy Basic Check\nhttps://www.artillery.io/docs/reference/extensions/ensure#basic-checks'
    )
};

const EnsurePluginConfigSchema = Joi.object({
  thresholds: Joi.array()
    .items(Joi.any())
    .meta({ title: 'Threshold Checks' })
    .description(
      'Ensure that a metric is under some threshold value.\nhttps://www.artillery.io/docs/reference/extensions/ensure#threshold-checks'
    ), //TODO: for now this is typed with any as arbitrary key:value pairs are hard to achieve in Joi
  conditions: Joi.array()
    .items(
      Joi.object({
        expression: Joi.string().meta({ title: 'Conditional Expression' }),
        strict: artilleryStringBoolean.meta({ title: 'Strict?' })
      })
    )
    .meta({ title: 'Conditional Checks' })
    .description(
      'Set more complex expressions for additional checks.\nhttps://www.artillery.io/docs/reference/extensions/ensure#advanced-conditional-checks'
    ),
  ...EnsureLegacyOptions
}).unknown(false);

module.exports = {
  EnsurePluginConfigSchema
};
