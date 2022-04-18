const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const config = Joi.object({
  target: Joi.string().required(),
  http: Joi.object({
    extendedMetrics: Joi.boolean(),
    maxSockets: Joi.number(),
    timeout: Joi.number()
  }),
  environment: Joi.object(),
  processor: Joi.string(),
  phases: Joi.array()
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

const flowItem = {
  function: Joi.string(),
  log: Joi.string(),
  think: Joi.number(),
  loop: Joi.array(),
  ...httpItems,
  ...wsItems,
  ...socketioItems
};

const flowItemSchema = Joi.object(flowItem).when('.loop', {
  is: Joi.exist(),
  then: Joi.object({
    count: Joi.number(),
    over: Joi.alternatives(Joi.array(), Joi.string())
  })
});

const scenarioItem = Joi.object({
  name: Joi.string(),
  engine: Joi.string(),
  beforeScenario: Joi.array().items(Joi.string()).single(),
  afterScenario: Joi.array().items(Joi.string()).single(),
  flow: Joi.array().items(flowItemSchema).required()
});

const schema = Joi.object({
  config: config,
  scenarios: Joi.array().items(scenarioItem).required(),
  before: Joi.object({
    flow: Joi.array().items(flowItem).required()
  }),
  after: Joi.object({
    flow: Joi.array().items(flowItem).required()
  })
});

module.exports = (script) => {
  //console.log(JSON.stringify(script, null, 2));
  const { error } = schema.validate(script);

  if (error && error.details.length) {
    return error.details[0].message;
  }
};
