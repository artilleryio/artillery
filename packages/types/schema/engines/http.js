const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);
const { ExpectPluginImplementationSchema } = require('../plugins/expect');

const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());

const BaseFlowItemAlternatives = [
  Joi.object({
    function: Joi.string()
      .meta({ title: 'Function' })
      .description('Function name to run.')
  }),
  Joi.object({
    log: Joi.string()
      .meta({ title: 'Log' })
      .description('Print given message to the console.')
  }),
  Joi.object({
    think: artilleryStringNumber
      .meta({ title: 'Think time' })
      .description('Pause virtual user for the given duration (in seconds).')
  })
];

//TODO: add request with body properties
const HttpMethodProperties = Joi.object({
  url: Joi.string().required().meta({ title: 'URL' }),
  headers: Joi.object().meta({ title: 'Headers' }),
  cookie: Joi.object() //TODO: maybe make this a [name: string]: string
    .meta({ title: 'Cookies' }), //TODO: make them strings only,
  followRedirect: Joi.boolean()
    .meta({ title: 'Disable redirect following' })
    .description(
      'Artillery follows redirects by default.\nSet this option to `false` to stop following redirects.'
    ),
  qs: Joi.object().meta({ title: 'Query string object' }),
  gzip: Joi.boolean()
    .meta({ title: 'Compression' })
    .description(
      "Automatically set the 'Accept-Encoding' request header and decode compressed responses encoded with gzip."
    ),
  capture: Joi.alternatives(Joi.object(), Joi.array().items(Joi.object()))
    .meta({ title: 'Capture' })
    .description(
      'Capture and reuse parts of a response\nhttps://www.artillery.io/docs/reference/engines/http#extracting-and-re-using-parts-of-a-response-request-chaining'
    ), //TODO: add capture here
  auth: Joi.object({
    user: Joi.string().meta({ title: 'Username' }),
    pass: Joi.string().meta({ title: 'Password' })
  }).meta({ title: 'Basic authentication' }),
  beforeRequest: Joi.alternatives(Joi.string(), Joi.array().items(Joi.string()))
    .meta({ title: 'Before Request' })
    .description('Functions to run before every request is sent.'), //TODO: this is likely different on a resolved config
  afterResponse: Joi.alternatives(Joi.string(), Joi.array().items(Joi.string()))
    .meta({ title: 'After Response' })
    .description('Functions to run after every response is received.'), //TODO: this is likely different on a resolved config
  ifTrue: Joi.string()
    .meta({ title: 'Request Condition' })
    .description('Expression that controls when to execute this request.'),
  //TODO: add match here (deprecated)
  expect: Joi.alternatives(
    ExpectPluginImplementationSchema,
    Joi.array().items(ExpectPluginImplementationSchema)
  )
    .meta({ title: 'Expect plugin expectations' })
    .description(
      'More information: https://www.artillery.io/docs/reference/extensions/expect#expectations'
    )
});

const BaseWithHttp = [
  ...BaseFlowItemAlternatives,
  Joi.object({
    get: HttpMethodProperties.meta({ title: 'Perform a GET request' })
  }),
  Joi.object({
    post: HttpMethodProperties.meta({ title: 'Perform a POST request' })
  }), //TODO: add body options
  Joi.object({
    put: HttpMethodProperties.meta({ title: 'Perform a PUT request' })
  }),
  Joi.object({
    patch: HttpMethodProperties.meta({ title: 'Perform a PATCH request' })
  }),
  Joi.object({
    delete: HttpMethodProperties.meta({ title: 'Perform a DELETE request' })
  }) //TODO: do we need head and options methods?
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

const HttpDefaultsConfigSchema = Joi.object({
  headers: Joi.object()
    .meta({ title: 'Request Headers' })
    .description(
      'Default headers to be used in all requests.\nhttps://www.artillery.io/docs/reference/engines/http#default-configuration'
    ),
  cookie: Joi.object()
    .meta({ title: 'Request Cookies' })
    .description('Default cookies to be used in all requests.'),
  strictCapture: Joi.alternatives(Joi.boolean(), Joi.string())
    .meta({ title: 'Strict capture' })
    .description(
      'Whether to turn on strict capture by default for all captures.\nhttps://www.artillery.io/docs/reference/engines/http#turn-off-strict-capture'
    ),
  think: Joi.object({
    jitter: artilleryStringNumber
      .meta('Jitter')
      .description(
        'Sets jitter to simulate real-world random variance into think time pauses. Accepts both number and percentage.'
      )
  }).meta({ title: 'Think Options' })
});

const HttpConfigSchema = Joi.object({
  timeout: artilleryStringNumber
    .meta({ title: 'Request Timeout' })
    .description('Increase or decrease request timeout'),
  maxSockets: artilleryStringNumber
    .meta({ title: 'Maximum Sockets' })
    .description(
      'Maximum amount of TCP connections per virtual user.\nhttps://www.artillery.io/docs/reference/engines/http#max-sockets-per-virtual-user'
    ),
  extendedMetrics: Joi.boolean()
    .meta({ title: 'Enable Extended Metrics' })
    .description(
      'Enable tracking of additional HTTP metrics.\nhttps://www.artillery.io/docs/reference/engines/http#additional-performance-metrics'
    ),
  defaults: HttpDefaultsConfigSchema.meta({
    title: 'Configure Default Settings for all requests'
  })
});

module.exports = {
  HttpFlowItemSchema,
  BaseWithHttp,
  HttpConfigSchema
};
