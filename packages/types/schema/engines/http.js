const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);
const { ExpectPluginImplementationSchema } = require('../plugins/expect');

const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());

const BaseFlowItemAlternatives = [
  Joi.object({ function: Joi.string() }),
  Joi.object({ log: Joi.string().meta({ title: 'Log from inside' }) }).meta({
    title: 'Logging'
  }),
  Joi.object({ think: artilleryStringNumber })
];

//TODO: add request with body properties
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
        .meta({ title: 'Loop (Http)' }),
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

module.exports = {
  HttpFlowItemSchema
};
