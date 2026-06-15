const Joi = require('joi');
const {
  getFakerFunctions,
  getDeprecatedAliases
} = require('artillery-plugin-fake-data');

const buildFakerObject = () => {
  const fakerJoiObject = {};

  for (const funcName of getFakerFunctions()) {
    fakerJoiObject[funcName] = Joi.object()
      .meta({ title: `Faker Function: ${funcName}` })
      .description(
        'For information on what options this function takes, check the Faker documentation: https://fakerjs.dev/api/'
      );
  }

  for (const aliasName of Object.keys(getDeprecatedAliases())) {
    fakerJoiObject[aliasName] = Joi.object()
      .meta({ title: `Deprecated Alias: ${aliasName}` })
      .description(
        'Deprecated alias kept for backwards compatibility. Use the equivalent Faker function name instead.'
      );
  }

  return fakerJoiObject;
};

const FakeDataPlugin = Joi.object({
  ...buildFakerObject()
})
  .unknown(false)
  .meta({ title: 'Fake Data Plugin' })
  .description(
    'This plugin adds access to random realistic test data generation using Faker. You can configure the options of each function in the config. \nFor more information, check our documentation: https://www.artillery.io/docs/reference/extensions/fake-data'
  );

module.exports = {
  FakeDataPlugin
};
