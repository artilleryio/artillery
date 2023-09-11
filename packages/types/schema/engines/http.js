const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);
const { BaseFlowItemAlternatives, LoopOptions } = require('./common');
const { ExpectPluginImplementationSchema } = require('../plugins/expect');

const {
  artilleryNumberOrString,
  artilleryBooleanOrString
} = require('../joi.helpers');

const SharedCaptureProperties = {
  as: Joi.string().meta({ title: 'Name your capture' }),
  strict: artilleryBooleanOrString
    .meta({ title: 'Strict?' })
    .description(
      'Captures are strict by default, so if a capture fails (no match), no subsequent request will run. You can configure that behaviour with this option.'
    )
};

const CaptureSchema = Joi.alternatives()
  .try(
    Joi.object({
      json: Joi.string().required().meta({ title: 'Jsonpath expression' }),
      ...SharedCaptureProperties
    }).meta({ title: 'JSON Capture' }),
    Joi.object({
      xpath: Joi.string().meta({ title: 'Xpath expression' }).required(),
      ...SharedCaptureProperties
    }).meta({ title: 'XPath Capture' }),
    Joi.object({
      regexp: Joi.string().meta({ title: 'Regular expression' }).required(),
      group: artilleryNumberOrString
        .meta({ title: 'Regex Group' })
        .description('Named or Integer Index capturing group'),
      flags: Joi.object()
        .meta('RegExp Flags')
        .description('Flags for the regular expression'),
      ...SharedCaptureProperties
    }).meta({ title: 'RegExp Capture' }),
    Joi.object({
      header: Joi.string()
        .meta({ title: 'Header name' })
        .required()
        .description(
          'Allows you to set the name of the response header whose value you want to capture.'
        ),
      ...SharedCaptureProperties
    }).meta({ title: 'Header Capture' }),
    Joi.object({
      selector: Joi.string()
        .meta({ title: 'Cheerio element selector' })
        .required(),
      attr: Joi.string().meta({ title: 'Attribute Name' }),
      index: Joi.alternatives(
        artilleryNumberOrString,
        Joi.string().valid('last', 'random')
      )
        .meta({ title: 'Desired Index' })
        .description(
          'Grap element at specific index, last index or at random (otherwise, first one found).'
        ),
      ...SharedCaptureProperties
    }).meta({ title: 'Selector (Cheerio) Capture' })
  )
  .match('one');

const SharedHttpMethodProperties = {
  url: Joi.string().required().meta({ title: 'URL' }),
  name: Joi.string()
    .meta({ title: 'URL name' })
    .description(
      'Descriptive name for your URL. Certain plugins and features use this name instead of the full URL due to dynamic request urls.'
    ),
  headers: Joi.object().meta({ title: 'Headers' }),
  cookie: Joi.object() //TODO: maybe make this a [name: string]: string
    .meta({ title: 'Cookies' }),
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
  capture: Joi.alternatives(CaptureSchema, Joi.array().items(CaptureSchema))
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
};

const HttpMethodPropertiesWithBody = {
  ...SharedHttpMethodProperties,
  json: Joi.any().meta({ title: 'JSON response body' }),
  body: Joi.any().meta({ title: 'Raw response body' }),
  form: Joi.object()
    .meta({ title: 'Url-encoded Form' })
    .description(
      'https://www.artillery.io/docs/reference/engines/http#url-encoded-forms-applicationx-www-form-urlencoded'
    ),
  formData: Joi.object()
    .meta({ title: 'Multipart Forms' })
    .description(
      'https://www.artillery.io/docs/reference/engines/http#multipart-forms-multipartform-data'
    )
};

const BaseWithHttp = [
  ...BaseFlowItemAlternatives,
  Joi.object({
    get: Joi.object(SharedHttpMethodProperties).meta({
      title: 'Perform a GET request'
    })
  }),
  Joi.object({
    post: Joi.object(HttpMethodPropertiesWithBody).meta({
      title: 'Perform a POST request'
    })
  }),
  Joi.object({
    put: Joi.object(HttpMethodPropertiesWithBody).meta({
      title: 'Perform a PUT request'
    })
  }),
  Joi.object({
    patch: Joi.object(HttpMethodPropertiesWithBody).meta({
      title: 'Perform a PATCH request'
    })
  }),
  Joi.object({
    delete: Joi.object(HttpMethodPropertiesWithBody).meta({
      title: 'Perform a DELETE request'
    })
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
      ...LoopOptions
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
    jitter: artilleryNumberOrString
      .meta('Jitter')
      .description(
        'Sets jitter to simulate real-world random variance into think time pauses. Accepts both number and percentage.'
      )
  }).meta({ title: 'Think Options' })
});

const HttpConfigSchema = Joi.object({
  timeout: artilleryNumberOrString
    .meta({ title: 'Request Timeout' })
    .description('Increase or decrease request timeout'),
  maxSockets: artilleryNumberOrString
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
