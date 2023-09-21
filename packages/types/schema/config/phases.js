const { artilleryNumberOrString } = require('../joi.helpers');

const Joi = require('joi').defaults((schema) =>
  schema.options({ abortEarly: true })
);

const CommonPhaseProperties = {
  name: Joi.string().meta({ title: 'Test Phase Name' })
};

const CommonArrivalPhaseProperties = {
  ...CommonPhaseProperties,
  duration: artilleryNumberOrString
    .required()
    .meta({ title: 'Test Phase Duration' })
    .description(
      'Test phase duration (in seconds).\nCan also be any valid human-readable duration: https://www.npmjs.com/package/ms .'
    ),
  maxVusers: artilleryNumberOrString
    .meta({ title: 'Maximum virtual users' })
    .description(
      'Cap the number of concurrent virtual users at any given time.'
    )
};

const TestPhaseWithArrivalCount = Joi.object({
  ...CommonArrivalPhaseProperties,
  arrivalCount: artilleryNumberOrString
    .required()
    .meta({ title: 'Arrival Count' })
    .description(
      'Fixed number of virtual users over that time period.\nhttps://www.artillery.io/docs/reference/test-script#fixed-number-of-arrivals-per-second'
    )
})
  .meta({ title: 'Arrival Count Phase' })
  .unknown(false);

const TestPhaseWithArrivalRate = Joi.object({
  ...CommonArrivalPhaseProperties,
  arrivalRate: artilleryNumberOrString
    .meta({ title: 'Arrival Rate' })
    .description(
      'Constant arrival rate - i.e. the number of virtual users generated every second.\nhttps://www.artillery.io/docs/reference/test-script#constant-arrival-rate'
    ),
  rampTo: artilleryNumberOrString
    .meta({ title: 'Ramp up rate' })
    .description(
      'Ramp from initial arrivalRate to this value over time period.\nhttps://www.artillery.io/docs/reference/test-script#ramp-up-rate'
    )
})
  .or('arrivalRate', 'rampTo')
  .meta({ title: 'Arrival Rate Phase' })
  .unknown(false);

const TestPhaseWithPause = Joi.object({
  ...CommonPhaseProperties,
  pause: artilleryNumberOrString
    .required()
    .meta({ title: 'Pause' })
    .description(
      'Pause the test phase execution for given duration (in seconds).\nCan also be any valid human-readable duration: https://www.npmjs.com/package/ms.'
    )
})
  .meta({ title: 'Pause Phase' })
  .unknown(false);

const TestPhase = Joi.alternatives()
  .try(TestPhaseWithArrivalRate, TestPhaseWithArrivalCount, TestPhaseWithPause)
  .meta({ title: 'Test Phase' });

module.exports = {
  TestPhase
};
