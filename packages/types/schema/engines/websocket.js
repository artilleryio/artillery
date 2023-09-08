const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());

const BaseFlowItemAlternatives = [
  Joi.object({ function: Joi.string() }),
  Joi.object({ log: Joi.string().meta({ title: 'Log from inside' }) }).meta({
    title: 'Logging'
  }),
  Joi.object({ think: artilleryStringNumber })
];

const BaseWithWs = [
  ...BaseFlowItemAlternatives,
  Joi.object({
    send: Joi.alternatives(Joi.string(), Joi.object())
  }),
  Joi.object({
    connect: Joi.alternatives(
      Joi.string(),
      Joi.object({
        function: Joi.string()
      }),
      Joi.object({
        target: Joi.string(),
        proxy: Joi.object({
          url: Joi.string()
        })
      })
    )
  })
];

const WsFlowItemSchema = Joi.alternatives()
  .try(
    ...BaseWithWs,
    Joi.object({
      loop: Joi.array()
        .items(
          Joi.alternatives()
            .try(...BaseWithWs)
            .match('all')
            .required()
        )
        .meta({ title: 'Loop (Websocket)' }),
      whileTrue: Joi.string(),
      count: Joi.alternatives(Joi.string(), Joi.number()),
      over: Joi.alternatives(Joi.string(), Joi.array().items(Joi.string()))
    })
  )
  .match('all')
  .id('WsFlowItemSchema');

module.exports = {
  WsFlowItemSchema
};
