const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());

const BaseFlowItemAlternatives = [
  Joi.object({
    function: Joi.string()
      .meta({ title: 'Function' })
      .description('Function name to run.')
  }),
  Joi.object({
    log: Joi.string()
      .meta({ title: 'Log' })
      .description('Print given message to the console.')
  }),
  Joi.object({
    think: artilleryStringNumber
      .meta({ title: 'Think time' })
      .description('Pause virtual user for the given duration (in seconds).')
  })
];

module.exports = {
  BaseFlowItemAlternatives
};
