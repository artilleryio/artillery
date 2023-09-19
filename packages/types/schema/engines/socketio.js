const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { LoopOptions } = require('./common');
const { BaseWithHttp } = require('./http');

//TODO: add metadata

const BaseWithSocketio = [
  ...BaseWithHttp,
  //TODO: review this schema and if it should also import base flow item.
  Joi.object({
    emit: Joi.alternatives(
      Joi.object({
        channel: Joi.string(),
        data: Joi.string()
      }),
      Joi.array().items(Joi.string())
    ),
    response: Joi.object({
      channel: Joi.string(),
      data: Joi.string()
      //TODO add capture and match
    }),
    acknowledge: Joi.object({
      data: Joi.string(),
      match: Joi.object({
        json: Joi.any(),
        value: Joi.string()
      })
    }),
    namespace: Joi.string()
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
      ...LoopOptions
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
