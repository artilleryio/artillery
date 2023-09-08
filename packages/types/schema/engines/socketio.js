const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { BaseWithHttp } = require('./http');

const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());

const BaseFlowItemAlternatives = [
  Joi.object({ function: Joi.string() }),
  Joi.object({ log: Joi.string().meta({ title: 'Log from inside' }) }).meta({
    title: 'Logging'
  }),
  Joi.object({ think: artilleryStringNumber })
];

const BaseWithSocketio = [
  // ...BaseFlowItemAlternatives,
  ...BaseWithHttp,
  //TODO: review this schema.
  Joi.object({
    emit: Joi.object({
      channel: Joi.string(),
      data: Joi.string(),
      namespace: Joi.string(),
      response: Joi.object({
        channel: Joi.string(),
        data: Joi.string()
      }),
      acknowledge: Joi.object({
        data: Joi.string(),
        match: Joi.string()
      })
    })
  })
];

const SocketIoFlowItemSchema = Joi.alternatives()
  .try(
    ...BaseWithSocketio,
    Joi.object({
      loop: Joi.array()
        .items(
          Joi.alternatives()
            .try(...BaseWithSocketio)
            .match('all')
            .required()
        )
        .meta({ title: 'Loop (SocketIo)' }),
      whileTrue: Joi.string(),
      count: artilleryStringNumber,
      over: Joi.alternatives(Joi.string(), Joi.array().items(Joi.string()))
    })
  )
  .match('all')
  .id('SocketIoFlowItemSchema');

const SocketIoConfigSchema = Joi.object({
  query: Joi.alternatives(Joi.string(), Joi.object()),
  path: Joi.string(),
  extraHeaders: Joi.object(),
  transports: Joi.array().items(Joi.string().valid('websocket')).single() //TODO: review how to make this autofill with the only option
});

module.exports = {
  SocketIoFlowItemSchema,
  SocketIoConfigSchema
};
