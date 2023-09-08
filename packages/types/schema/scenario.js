const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { ExpectPluginImplementationSchema } = require('./plugins/expect');

const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());

const HttpMethodProperties = Joi.object({
  url: Joi.string().required(),
  headers: Joi.object(),
  cookie: Joi.object(), //TODO: make them strings only,
  followRedirect: Joi.boolean(),
  qs: Joi.object(),
  gzip: Joi.boolean(),
  capture: Joi.object(), //TODO: add capture here
  auth: Joi.object({
    user: Joi.string(),
    pass: Joi.string()
  }),
  beforeRequest: Joi.alternatives(
    Joi.string(),
    Joi.array().items(Joi.string())
  ), //TODO: this is likely different on a resolved config
  afterResponse: Joi.alternatives(
    Joi.string(),
    Joi.array().items(Joi.string())
  ), //TODO: this is likely different on a resolved config
  ifTrue: Joi.string(),
  //match TODO: add match here (deprecated)
  expect: Joi.alternatives(
    ExpectPluginImplementationSchema,
    Joi.array().items(ExpectPluginImplementationSchema)
  )
});

// const HttpMethodWithBodyProperties = HttpMethodProperties.

const BaseFlowItemAlternatives = [
  Joi.object({ function: Joi.string() }),
  Joi.object({ log: Joi.string().meta({ title: 'Log from inside' }) }).meta({
    title: 'Logging'
  }),
  Joi.object({ think: artilleryStringNumber })
];

const BaseWithHttp = [
  ...BaseFlowItemAlternatives,
  Joi.object({
    get: HttpMethodProperties.description('hi there still me').meta({
      title: 'GET REQUEST'
    })
  }),
  Joi.object({ post: HttpMethodProperties }), //TODO: add body options
  Joi.object({ put: HttpMethodProperties }),
  Joi.object({ patch: HttpMethodProperties }),
  Joi.object({ delete: HttpMethodProperties }) //TODO: do we need head and options methods?
];

const HttpFlowItemSchema = Joi.alternatives()
  .try(
    ...BaseWithHttp,
    // ...BaseFlowItemAlternatives,
    // Joi.object({get: HttpMethodProperties.description("hi there still me").meta({title: "GET REQUEST"})}),
    // Joi.object({post: HttpMethodProperties}),//TODO: add body options
    // Joi.object({put: HttpMethodProperties}),
    // Joi.object({patch: HttpMethodProperties}),
    // Joi.object({delete: HttpMethodProperties}),//TODO: do we need head and options methods?
    Joi.object({
      loop: Joi.array()
        .items(
          Joi.alternatives()
            .try(
              // Joi.link('#HttpFlowItemSchema')
              ...BaseWithHttp
            )
            .match('all')
            .required()
        )
        .meta({ title: 'Loop' }),
      whileTrue: Joi.string(),
      count: Joi.alternatives(Joi.string(), Joi.number()),
      over: Joi.alternatives(Joi.string(), Joi.array().items(Joi.string()))
    })
  )
  .match('all')
  .id('HttpFlowItemSchema');

// const HttpFlowItemSchema2 = Joi.object({
//     function: Joi.string(),
//     think: Joi.alternatives(Joi.number(), Joi.string()),
//     log: Joi.string().meta({title: "Logging"}),
//     get: HttpMethodProperties.description("hi there still me").meta({title: "GET REQUEST"}),
//     post: HttpMethodProperties
// })

// const HttpLoopSchema = Joi.object({
//     loop: Joi.array().items(HttpFlowItemSchema).meta({title: "Http Loop"}),
//     whileTrue: Joi.string(),
//     count: Joi.alternatives(Joi.string(), Joi.boolean()),
//     over: Joi.alternatives(Joi.string(), Joi.array().items(Joi.string()))
// })

const ScenarioSchema = Joi.object({
  name: Joi.string(),
  // engine: Joi.alternatives().conditional('engine', { is: Joi.alternatives('socketio', 'ws', 'http'), then: Joi.alternatives('socketio', 'ws', 'http'), otherwise: Joi.string().invalid('socketio', 'ws', 'http')}),//TODO:maybe improve this?
  // flow: Joi.array().items(Joi.object()),
  engine: Joi.alternatives('http', 'ws', 'socketio', Joi.string()),
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
        .items(Joi.object())
        .required()
        .meta({ title: 'Websocket Engine Flow' })
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
  .when(Joi.object({ engine: Joi.string().not('ws', 'http') }), {
    then: Joi.object({
      engine: Joi.string(),
      // flow: Joi.array().items(Joi.any()).required().meta({title: 'Generic Engine Flow'})
      flow: Joi.any().required().meta({ title: 'Generic Engine Flow' })
    })
  });

// TODO: PR in joi-to-json repo for converting deprecated and default

//TODO: loops are still not working well. I am not sure why it doesnt detect things correctly
//TODO: Lets do all the descriptions
//TODO: check why it doesnt accuse  when you do get: url: number
//TODO: type socketio and ws

module.exports = {
  ScenarioSchema
};
