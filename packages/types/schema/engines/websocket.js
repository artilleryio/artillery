const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { BaseFlowItemAlternatives } = require('./common');

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

//TODO: add info here that you can configure underlying ws client
const WsConfigSchema = Joi.object({
  subprotocols: Joi.array()
    .items(Joi.string().valid('json', 'soap', 'wamp', 'xmpp'))
    .meta({ title: 'Websocket sub-protocols' }),
  headers: Joi.object().meta({ title: 'Headers' }),
  proxy: Joi.object({
    url: Joi.string().required().meta({ title: 'URL' })
  }).meta({ title: 'Proxy' })
});

module.exports = {
  WsFlowItemSchema,
  WsConfigSchema
};
