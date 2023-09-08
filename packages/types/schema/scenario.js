const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { HttpFlowItemSchema } = require('./engines/http');
const { WsFlowItemSchema } = require('./engines/websocket');
const { SocketIoFlowItemSchema } = require('./engines/socketio');

const ScenarioSchema = Joi.object({
  name: Joi.string(),
  // engine: Joi.alternatives().conditional('engine', { is: Joi.alternatives('socketio', 'ws', 'http'), then: Joi.alternatives('socketio', 'ws', 'http'), otherwise: Joi.string().invalid('socketio', 'ws', 'http')}),//TODO:maybe improve this?
  // flow: Joi.array().items(Joi.object()),
  engine: Joi.alternatives('http', 'ws', 'websocket', 'socketio', Joi.string()),
  beforeScenario: Joi.array().items(Joi.string()).single(), //TODO:review this
  afterScenario: Joi.array().items(Joi.string()).single() //TODO:review this
})
  // .when('engine', {
  //     is: 'http',
  //     then: Joi.object({
  //         engine: Joi.string().valid('http'),
  //         flow: Joi.array().items(HttpFlowItemSchema).required().meta({title: 'HTTP Engine Flow'})
  //     })
  // })
  // .when('engine', {
  //     is: Joi.any().valid(null, ""),
  //     then: Joi.object({
  //         engine: Joi.any().valid(null, ""),
  //         flow: Joi.array().items(HttpFlowItemSchema).required().meta({title: 'HTTP Engine Flow (Default)'})
  //     })
  // })
  .when(Joi.object({ engine: Joi.string().valid('http') }), {
    then: Joi.object({
      engine: Joi.string().valid('http'),
      flow: Joi.array()
        .items(HttpFlowItemSchema)
        .required()
        .meta({ title: 'HTTP Engine Flow' })
    })
    // then: Joi.object({
    //     engine: Joi.alternatives('http'),
    //     flow: Joi.array().items(Joi.alternatives(HttpFlowItemSchema, HttpLoopSchema)).required().meta({title: "HTTP Flow"})
    // }),
    // then: Joi.object({

    // })
    // then: Joi.when(Joi.object({}))
  })
  .when(Joi.object({ engine: Joi.string().valid('ws', 'websocket') }), {
    then: Joi.object({
      engine: Joi.string().valid('ws', 'websocket'),
      flow: Joi.array()
        .items(WsFlowItemSchema)
        .required()
        .meta({ title: 'Websocket Engine Flow' })
    })
  })
  .when(Joi.object({ engine: Joi.string().valid('socketio') }), {
    then: Joi.object({
      engine: Joi.string().valid('socketio'),
      flow: Joi.array()
        .items(SocketIoFlowItemSchema)
        .required()
        .meta({ title: 'SocketIo Engine Flow' })
    })
  })
  .when(Joi.object({ engine: Joi.any().valid(null, '') }), {
    then: Joi.object({
      engine: Joi.any().valid(null, ''),
      flow: Joi.array()
        .items(HttpFlowItemSchema)
        .required()
        .meta({ title: 'HTTP Engine Flow (Default)' })
    })
    // then: Joi.object({
    //     engine: Joi.any().valid(null, ""),
    //     flow: Joi.array().items(Joi.alternatives(HttpFlowItemSchema, HttpLoopSchema)).required().meta({title: "HTTP Flow"})
    // }),
  })
  .when(
    Joi.object({
      engine: Joi.string().not('ws', 'websocket', 'socketio', 'http')
    }),
    {
      then: Joi.object({
        engine: Joi.string(),
        // flow: Joi.array().items(Joi.any()).required().meta({title: 'Generic Engine Flow'})
        flow: Joi.any().meta({ title: 'Generic Engine Flow' }) //TODO: decide if flow should be required here? probably not
      })
    }
  );

// TODO: PR in joi-to-json repo for converting deprecated and default

//TODO: loops are still not working well. I am not sure why it doesnt detect things correctly
//TODO: Lets do all the descriptions
//TODO: check why it doesnt accuse  when you do get: url: number
//TODO: type socketio and ws

module.exports = {
  ScenarioSchema
};
