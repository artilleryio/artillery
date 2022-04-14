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
  capture: Joi.array().items(capture).single()
};

const flowItem = Joi.object({
  get: Joi.object(httpMethodProps),
  post: Joi.object(httpMethodProps),
  put: Joi.object(httpMethodProps),
  patch: Joi.object(httpMethodProps),
  delete: Joi.object(httpMethodProps),
  function: Joi.string(),
  log: Joi.string(),
  think: Joi.number()
}).max(1);

const scenarioItem = Joi.object({
  name: Joi.string(),
  flow: Joi.array().items(flowItem).required()
});

const schema = Joi.object({
  config: config,
  scenarios: Joi.array().items(scenarioItem),
  before: Joi.object({
    flow: Joi.array().items(flowItem).required()
  }),
  after: Joi.object({
    flow: Joi.array().items(flowItem).required()
  })
});

module.exports = (script) => {
  const { error } = schema.validate(script);

  if (error && error.details.length) {
    return error.details[0].message;
  }
};
