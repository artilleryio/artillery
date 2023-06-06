const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const config = Joi.object({
  target: Joi.string().when('environments', {
    not: Joi.exist(),
    then: Joi.required()
  }),
  http: Joi.object({
    extendedMetrics: Joi.boolean(),
    maxSockets: Joi.number(),
    timeout: Joi.alternatives(Joi.number(), Joi.string())
  }),
  environments: Joi.object(),
  processor: Joi.string(),
  phases: Joi.array(),
  engines: Joi.object()
  // payload: Joi.alternatives(Joi.object(), Joi.array())
});

const capture = Joi.object({
  as: Joi.string().required()
});

const httpMethodProps = {
  url: Joi.string().required(),
  headers: Joi.object(),
  cookie: Joi.object(),
  followRedirect: Joi.boolean(),
  qs: Joi.object(),
  gzip: Joi.boolean(),
  auth: Joi.object({
    user: Joi.string(),
    pass: Joi.string()
  }),
  beforeRequest: Joi.array().items(Joi.string()).single(),
  afterResponse: Joi.array().items(Joi.string()).single(),
  capture: Joi.array().items(capture).single()
};

const httpItems = {
  get: Joi.object(httpMethodProps),
  post: Joi.object(httpMethodProps),
  put: Joi.object(httpMethodProps),
  patch: Joi.object(httpMethodProps),
  delete: Joi.object(httpMethodProps)
};

const socketioItems = {
  emit: Joi.any().when(Joi.ref('....engine'), {
    is: 'socketio',
    then: Joi.object({
      channel: Joi.string(),
      data: Joi.any()
    }),
    otherwise: Joi.any()
  })
};

const wsItems = {
  connect: Joi.any().when(Joi.ref('....engine'), {
    is: 'ws',
    then: Joi.alternatives(Joi.object(), Joi.string()),
    otherwise: Joi.any()
  }),
  send: Joi.any()
};

const flowItemSchema = Joi.object({
  function: Joi.string(),
  log: Joi.string(),
  think: Joi.alternatives(Joi.number(), Joi.string()),
  loop: Joi.array(),
  ...httpItems,
  ...wsItems,
  ...socketioItems
}).when('.loop', {
  is: Joi.exist(),
  then: Joi.object({
    count: Joi.alternatives(Joi.number(), Joi.string()),
    over: Joi.alternatives(Joi.array(), Joi.string())
  }),
  otherwise: Joi.object().length(1)
});

const scenarioItem = Joi.object({
  name: Joi.string(),
  engine: Joi.string(),
  beforeScenario: Joi.array().items(Joi.string()).single(),
  afterScenario: Joi.array().items(Joi.string()).single(),
  flow: Joi.any().when('engine', {
    is: Joi.valid('socketio', 'ws', 'http'),
    then: Joi.array().items(flowItemSchema).required(),
    otherwise: Joi.array().items(Joi.any())
  })
});

const beforeAfterSchema = Joi.object({
  flow: Joi.any().when('...config.engines', {
    is: Joi.exist(),
    then: Joi.array().items(Joi.any()).required(),
    otherwise: Joi.array().items(flowItemSchema).required()
  })
});

const schema = Joi.object({
  config: config,
  scenarios: Joi.array().items(scenarioItem).required(),
  before: beforeAfterSchema,
  after: beforeAfterSchema
});

module.exports = (script) => {
  const { error } = schema.validate(script);

  if (error && error.details.length) {
    return error.details[0].message;
  }
};
