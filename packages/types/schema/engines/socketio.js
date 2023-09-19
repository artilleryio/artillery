const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { LoopOptions, MatchSchema, JsonCaptureSchema } = require('./common');
const { BaseWithHttp } = require('./http');

//TODO: add metadata

const SocketioDataSchema = Joi.alternatives(Joi.string(), Joi.object());

const BaseWithSocketio = [
  ...BaseWithHttp,
  //TODO: review this schema and if it should also import base flow item.
  Joi.object({
    emit: Joi.alternatives(
      Joi.object({
        channel: Joi.string(),
        data: SocketioDataSchema
      }),
      Joi.array().items(SocketioDataSchema)
    ),
    response: Joi.object({
      channel: Joi.string(),
      data: SocketioDataSchema,
      match: MatchSchema,
      capture: JsonCaptureSchema
    }),
    acknowledge: Joi.object({
      data: SocketioDataSchema,
      match: MatchSchema,
      capture: JsonCaptureSchema
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
