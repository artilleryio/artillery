const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { BaseFlowItemAlternatives, LoopOptions } = require('./common');
const { buildArtilleryKeyValue } = require('../joi.helpers');

//TODO: add metadata

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
      ...LoopOptions
    })
  )
  .match('all')
  .id('WsFlowItemSchema');

//TODO: add info here that you can configure underlying ws client
const WsConfigSchema = Joi.object({
  subprotocols: Joi.array()
    .items(Joi.string().valid('json', 'soap', 'wamp', 'xmpp'))
    .meta({ title: 'Websocket sub-protocols' }),
  headers: buildArtilleryKeyValue(Joi.string()).meta({ title: 'Headers' }),
  proxy: Joi.object({
    url: Joi.string().required().meta({ title: 'URL' })
  }).meta({ title: 'Proxy' })
});

module.exports = {
  WsFlowItemSchema,
  WsConfigSchema
};
