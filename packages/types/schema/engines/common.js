const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const {
  artilleryNumberOrString,
  artilleryBooleanOrString
} = require('../joi.helpers');

const SharedCaptureProperties = {
  as: Joi.string().meta({ title: 'Name your capture' }),
  strict: artilleryBooleanOrString
    .meta({ title: 'Strict?' })
    .description(
      'Captures are strict by default, so if a capture fails (no match), no subsequent request will run. You can configure that behaviour with this option.'
    )
};

const JsonCaptureSchema = Joi.object({
  json: Joi.string().required().meta({ title: 'Jsonpath expression' }),
  ...SharedCaptureProperties
}).meta({ title: 'JSON Capture' });

const MatchSchema = Joi.object({
  json: Joi.any(),
  value: Joi.string()
}).meta({ title: 'Match' });

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
    think: artilleryNumberOrString
      .meta({ title: 'Think time' })
      .description('Pause virtual user for the given duration (in seconds).')
  })
];

const LoopOptions = {
  whileTrue: Joi.string()
    .meta({ title: 'Loop While True' })
    .description(
      'Control the loop using custom logic:\nhttps://www.artillery.io/docs/reference/engines/http#looping-through-an-array'
    ),
  count: artilleryNumberOrString
    .meta({ title: 'Loop N times' })
    .description(
      'https://www.artillery.io/docs/reference/engines/http#looping-through-an-array'
    ),
  over: Joi.alternatives(Joi.string(), Joi.array().items(Joi.string()))
    .meta({ title: 'Loop over array' })
    .description(
      'https://www.artillery.io/docs/reference/engines/http#looping-through-an-array'
    )
};

module.exports = {
  BaseFlowItemAlternatives,
  LoopOptions,
  SharedCaptureProperties,
  JsonCaptureSchema,
  MatchSchema
};
