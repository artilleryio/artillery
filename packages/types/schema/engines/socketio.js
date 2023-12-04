const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { LoopOptions, MatchSchema, JsonCaptureSchema } = require('./common');
const { BaseWithHttp } = require('./http');
const { buildArtilleryKeyValue } = require('../joi.helpers');

const SocketioDataSchema = Joi.alternatives(
  Joi.string(),
  Joi.object(),
  Joi.array().items(Joi.string())
);

const BaseWithSocketio = [
  ...BaseWithHttp,
  //TODO: review this schema and if it should also import base flow item.
  Joi.object({
    emit: Joi.alternatives(
      Joi.object({
        channel: Joi.string()
          .meta({ title: 'Channel' })
          .description(
            'The name of the Socket.IO channel to emit an event to.\nIf using array mode, send as first argument instead.'
          ),
        data: SocketioDataSchema.meta({ title: 'Data' }).description(
          'The data to emit as a string or object (or more generally, a serializable data structure).'
        )
      }),
      Joi.array().items(
        SocketioDataSchema.meta({ title: 'Data' }).description(
          'The data to emit as a string or object (or more generally, a serializable data structure).'
        )
      )
    )
      .meta({ title: 'Emit Action' })
      .description(
        'Supports emitting action as an array, or by providing channel and data.\nMore information: https://www.artillery.io/docs/reference/engines/socketio#scenario-actions-and-configuration'
      ),
    response: Joi.object({
      on: Joi.string()
        .meta({ title: 'Event Name' })
        .description('The name of the event to listen to.'),
      channel: Joi.string()
        .meta({ title: 'Channel' })
        .description('The name of the channel where the response is received.'),
      data: SocketioDataSchema.meta({ title: 'Data' }).description(
        'The data to verify is in the response.'
      ),
      args: Joi.alternatives(
        Joi.string(),
        Joi.object(),
        Joi.array().items(Joi.string())
      )
        .meta({ title: 'Response Arguments' })
        .description('Assert that the response emits these arguments.'),
      match: MatchSchema.meta({ title: 'Match' }).description(
        'Match the response exactly to the value provided.'
      ),
      capture: JsonCaptureSchema
    }),
    acknowledge: Joi.object({
      data: SocketioDataSchema.meta({ title: 'Data' }).description(
        'The data to verify is in the acknowledge.'
      ),
      args: Joi.alternatives(
        Joi.string(),
        Joi.object(),
        Joi.array().items(Joi.string())
      )
        .meta({ title: 'Acknowledge Arguments' })
        .description(
          'Assert that the acknowledge callback was sent with these arguments.'
        ),
      match: MatchSchema.meta({ title: 'Match' }).description(
        'Match the response exactly to the value provided.'
      ),
      capture: JsonCaptureSchema
    }),
    namespace: Joi.string()
      .meta({ title: 'Namespace' })
      .description('Optional namespace to use for emitting the event.')
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
  query: Joi.alternatives(Joi.string(), buildArtilleryKeyValue(Joi.string()))
    .meta({ title: 'Query' })
    .description(
      'Query parameters can be specified as a string or dictionary.'
    ),
  path: Joi.string(),
  extraHeaders: buildArtilleryKeyValue(Joi.string())
    .meta({ title: 'Extra Headers' })
    .description(
      "Extra headers may be passed with this option. \nThe extraHeaders option only works if the default polling transport is used. When using other transports, extra headers won't be taken into account by the server."
    ),
  transports: Joi.array()
    .items(Joi.string().valid('websocket'))
    .single()
    .meta({ title: 'Websocket Transports only' })
    .description(
      'You can skip long-polling by using the transports option to specify WebSocket transport.'
    ) //TODO: review how to make this autofill with the only option
})
  .meta({ title: 'SocketIO Config Schema Options' })
  .description(
    'For more information on supported options, visit https://socket.io/docs/v4/client-api/'
  );

module.exports = {
  SocketIoFlowItemSchema,
  SocketIoConfigSchema
};
