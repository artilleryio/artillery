const Joi = require('joi');

const { artilleryNumberOrString } = require('../joi.helpers');

const SlackPluginConfigSchema = Joi.object({
  webhookUrl: artilleryNumberOrString
})
  .unknown(false)
  .meta({ title: 'Slack Plugin' });

module.exports = {
  SlackPluginConfigSchema
};
