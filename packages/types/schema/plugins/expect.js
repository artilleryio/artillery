// const Joi = require('joi').defaults((schema) =>
//   schema.options({ allowUnknown: true, abortEarly: true })
// );

const Joi = require('joi');

const { artilleryBooleanOrString } = require('../joi.helpers');

const ExpectPluginConfigSchema = Joi.object({
  outputFormat: Joi.string()
    .valid('pretty', 'json', 'prettyError', 'silent')
    .meta({ title: 'Output Format' }),
  formatter: Joi.string()
    .valid('pretty', 'json', 'prettyError', 'silent')
    .meta({ title: '(Deprecated) Formatter' }) //TODO: add deprecated status
    .description('Please use the `outputFormat` option instead.'),
  reportFailuresAsErrors: artilleryBooleanOrString
    .meta({ title: 'Report Failures as Errors' })
    .description(
      'Reports failures from expect plugin as errors in Artillery Report'
    ), //TODO: add default value
  useOnlyRequestNames: artilleryBooleanOrString
    .meta({ title: 'Use Only Request Names' })
    .description(
      'Use request name instead of the URL path when logging requests in console and report'
    ),
  expectDefault200: artilleryBooleanOrString
    .meta({ title: 'Expect 200 by default' })
    .description('Sets a 200 OK status code expectation for all requests.') //TODO: add default value
}).unknown(false);

const ExpectPluginImplementationSchema = {
  statusCode: Joi.alternatives(
    Joi.number(),
    Joi.string(),
    Joi.array().items(Joi.alternatives(Joi.number(), Joi.string()))
  )
    .meta({ title: 'Expectation: Status Code' })
    .description(
      'Check the response status code.\nIf a list of status codes is provided, check that the response status code is present in the list.\nhttps://www.artillery.io/docs/reference/extensions/expect#statuscode'
    ),
  notStatusCode: Joi.alternatives(
    Joi.number(),
    Joi.string(),
    Joi.array().items(Joi.alternatives(Joi.number(), Joi.string()))
  )
    .meta({ title: 'Expectation: Not Status Code' })
    .description(
      'Check the response status code does not equal given status code.\nIf a list of status codes is provided, check that the response status code is not present in the list.\nhttps://www.artillery.io/docs/reference/extensions/expect#notstatuscode'
    ),
  contentType: Joi.string()
    .meta({ title: 'Expectation: Content type' })
    .description(
      'Check that the value of the `Content-Type` response header.\nhttps://www.artillery.io/docs/reference/extensions/expect#contenttype'
    ),
  hasProperty: Joi.string()
    .meta({ title: 'Expectation: Has Property' })
    .description(
      'Check that the response object has the given property.\nhttps://www.artillery.io/docs/reference/extensions/expect#hasproperty-and-nothasproperty'
    ),
  notHasProperty: Joi.string()
    .meta({ title: 'Expectation: Not Has Property' })
    .description(
      "Check that the response object doesn't have the given property.\nhttps://www.artillery.io/docs/reference/extensions/expect#hasproperty-and-nothasproperty"
    ),
  equals: Joi.array()
    .items(Joi.string())
    .meta({ title: 'Expectation: Equals' })
    .description(
      'Check that two or more values are the same.\nhttps://www.artillery.io/docs/reference/extensions/expect#hasheader'
    ),
  hasHeader: Joi.string()
    .meta({ title: 'Expectation: Has Header' })
    .description(
      'Check that the response contains the given header.\nhttps://www.artillery.io/docs/reference/extensions/expect#hasheader'
    ),
  headerEquals: Joi.array()
    .items(Joi.string())
    .meta({ title: 'Expectation: Header Equals' })
    .description(
      'Check that the response contains a header and its value matches is present in the list.\nhttps://www.artillery.io/docs/reference/extensions/expect#headerequals'
    ),
  matchesRegexp: Joi.string()
    .meta({ title: 'Expectation: Matches Regular Expression' })
    .description(
      'Check that the response matches a regular expression.\nhttps://www.artillery.io/docs/reference/extensions/expect#matchesregexp'
    ),
  cdnHit: artilleryBooleanOrString
    .meta({ title: 'Expectation: Is CDN Hit' })
    .description(
      'Check the presence of a cache hit/miss header from a CDN.\nhttps://www.artillery.io/docs/reference/extensions/expect#cdnhit'
    )
};

module.exports = {
  ExpectPluginConfigSchema,
  ExpectPluginImplementationSchema
};
