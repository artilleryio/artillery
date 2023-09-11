const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { HttpFlowItemSchema } = require('./engines/http');
const { WsFlowItemSchema } = require('./engines/websocket');
const { SocketIoFlowItemSchema } = require('./engines/socketio');
const { PlaywrightSchemaObject } = require('./engines/playwright');

const ScenarioSchema = Joi.object({
  name: Joi.string().meta({ title: 'Scenario Name' }),
  // engine: Joi.alternatives().conditional('engine', { is: Joi.alternatives('socketio', 'ws', 'http'), then: Joi.alternatives('socketio', 'ws', 'http'), otherwise: Joi.string().invalid('socketio', 'ws', 'http')}),//TODO:maybe improve this?
  // flow: Joi.array().items(Joi.object()),
  //   engine: Joi.alternatives(
  //     'http',
  //     'ws',
  //     'websocket',
  //     'socketio',
  //     'playwright',
  //     null,
  //     Joi.string()
  //   ),
  weight: Joi.alternatives(Joi.string(), Joi.number()),
  beforeScenario: Joi.alternatives(
    Joi.string(),
    Joi.array().items(Joi.string()).single()
  )
    .meta({ title: 'beforeScenario hook' })
    .description(
      'Custom Javascript functions to run before each scenario\nhttps://www.artillery.io/docs/reference/engines/http#function-actions-and-beforescenario--afterscenario-hooks'
    ), //TODO:review this
  afterScenario: Joi.alternatives(
    Joi.string(),
    Joi.array().items(Joi.string()).single()
  )
    .meta({ title: 'afterScenario hook' })
    .description(
      'Custom Javascript functions to run after each scenario\nhttps://www.artillery.io/docs/reference/engines/http#function-actions-and-beforescenario--afterscenario-hooks'
    ) //TODO:review this
})
  .when(Joi.object({ engine: Joi.string().valid(null, '') }), {
    then: Joi.object({
      //   engine: Joi.string().valid(null, ''),
      flow: Joi.array()
        .items(HttpFlowItemSchema)
        .required()
        .meta({ title: 'HTTP Engine Flow (Default)' })
    }) //TODO: figure out why it's not defaulting to default engine
    // then: Joi.object({
    //     engine: Joi.any().valid(null, ""),
    //     flow: Joi.array().items(Joi.alternatives(HttpFlowItemSchema, HttpLoopSchema)).required().meta({title: "HTTP Flow"})
    // }),
  })
  .when(Joi.object({ engine: Joi.string().valid('http') }), {
    then: Joi.object({
      engine: Joi.string().valid('http').meta({ title: 'HTTP Engine' }),
      flow: Joi.array()
        .items(HttpFlowItemSchema)
        .required()
        .meta({ title: 'HTTP Engine Flow' })
    })
  })
  .when(Joi.object({ engine: Joi.string().valid('ws', 'websocket') }), {
    then: Joi.object({
      engine: Joi.string()
        .valid('ws', 'websocket')
        .meta({ title: 'Websocket Engine' }),
      flow: Joi.array()
        .items(WsFlowItemSchema)
        .required()
        .meta({ title: 'Websocket Engine Flow' })
      //TODO: make afterscenario forbidden?
    })
  })
  .when(Joi.object({ engine: Joi.string().valid('socketio') }), {
    then: Joi.object({
      engine: Joi.string().valid('socketio').meta({ title: 'SocketIo Engine' }),
      flow: Joi.array()
        .items(SocketIoFlowItemSchema)
        .required()
        .meta({ title: 'SocketIo Engine Flow' })
    })
  })
  .when(Joi.object({ engine: Joi.string().valid('playwright') }), {
    then: Joi.object({
      engine: Joi.string()
        .valid('playwright')
        .meta({ title: 'Playwright Engine' }),
      ...PlaywrightSchemaObject
    })
  })
  .when(
    Joi.object({
      engine: Joi.string().not(
        'ws',
        'websocket',
        'socketio',
        'http',
        'playwright'
      )
    }),
    {
      then: Joi.object({
        engine: Joi.string().meta({ title: 'Custom Engine' }),
        // flow: Joi.array().items(Joi.any()).required().meta({title: 'Generic Engine Flow'})
        flow: Joi.any().meta({ title: 'Custom Engine Flow' }) //TODO: decide if flow should be required here? probably not
      })
    }
  );

// TODO: PR in joi-to-json repo for converting deprecated and default

//TODO: Lets do all the descriptions

//TODO: type this with engine flows
const BeforeAfterScenarioSchema = Joi.object({
  flow: Joi.array().items(Joi.any())
});

module.exports = {
  ScenarioSchema,
  BeforeAfterScenarioSchema
};
