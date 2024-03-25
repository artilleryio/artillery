const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { HttpFlowItemSchema } = require('./engines/http');
const { WsFlowItemSchema } = require('./engines/websocket');
const { SocketIoFlowItemSchema } = require('./engines/socketio');
const { PlaywrightSchemaObject } = require('./engines/playwright');

const BeforeAfterScenarioProperties = {
  beforeScenario: Joi.alternatives(
    Joi.string(),
    Joi.array().items(Joi.string()) //TODO:review this. For runtime validation it would be different
  )
    .meta({ title: 'beforeScenario hook' })
    .description(
      'Custom Javascript functions to run before each scenario\nhttps://www.artillery.io/docs/reference/engines/http#function-actions-and-beforescenario--afterscenario-hooks'
    ),
  afterScenario: Joi.alternatives(
    Joi.string(),
    Joi.array().items(Joi.string()) //TODO:review this. For runtime validation it would be different
  )
    .meta({ title: 'afterScenario hook' })
    .description(
      'Custom Javascript functions to run after each scenario\nhttps://www.artillery.io/docs/reference/engines/http#function-actions-and-beforescenario--afterscenario-hooks'
    )
};

const ScenarioSchema = Joi.object({
  name: Joi.string().meta({ title: 'Scenario Name' }),
  weight: Joi.alternatives(Joi.string(), Joi.number())
    .meta({ title: 'Scenario weight' })
    .description(
      'Use this to specify that some scenarios should be picked more often than others.\nhttps://www.artillery.io/docs/reference/test-script#scenario-weights'
    )
})
  .when(Joi.object({ engine: Joi.string().valid(null, '') }), {
    then: Joi.object({
      ...BeforeAfterScenarioProperties,
      flow: Joi.array()
        .items(HttpFlowItemSchema)
        .required()
        .meta({ title: 'HTTP Engine Flow (Default)' })
    }) //TODO: figure out why it's not defaulting to default engine properly - just allowing all engines. has to do with oneOf vs anyOf vs allOf
  })
  .when(Joi.object({ engine: Joi.string().valid('http') }), {
    then: Joi.object({
      engine: Joi.string().valid('http').meta({ title: 'HTTP Engine' }),
      ...BeforeAfterScenarioProperties,
      flow: Joi.array()
        .items(HttpFlowItemSchema)
        .required()
        .meta({ title: 'HTTP Engine Flow' })
    })
  })
  .when(Joi.object({ engine: Joi.string().valid('ws') }), {
    //NOTE: needed to separate ws and websocket into two cases otherwise autocomplete wouldnt work
    then: Joi.object({
      engine: Joi.string().valid('ws').meta({ title: 'Websocket Engine' }),
      flow: Joi.array()
        .items(WsFlowItemSchema)
        .required()
        .meta({ title: 'Websocket Engine Flow' })
    })
  })
  .when(Joi.object({ engine: Joi.string().valid('websocket') }), {
    then: Joi.object({
      engine: Joi.string()
        .valid('websocket')
        .meta({ title: 'Websocket Engine' }),
      flow: Joi.array()
        .items(WsFlowItemSchema)
        .required()
        .meta({ title: 'Websocket Engine Flow' })
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
        flow: Joi.any().meta({ title: 'Custom Engine Flow' })
      })
    }
  );

//TODO: implement full schema consistent with scenario - right now it's Joi.any() on items
const BeforeAfterSchema = Joi.object({
  flow: Joi.array()
    .items(Joi.any())
    .meta({ title: 'Flow object' })
    .description(
      'https://www.artillery.io/docs/reference/test-script#before-and-after-sections'
    )
});

module.exports = {
  ScenarioSchema,
  BeforeAfterSchema
};
