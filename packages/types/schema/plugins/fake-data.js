const Joi = require('joi');
const falso = require('@ngneat/falso');
const { getFalsoFunctions } = require('artillery-plugin-fake-data');

const buildFalsoObject = () => {
  const falsoJoiObject = {};

  for (const funcName of getFalsoFunctions()) {
    falsoJoiObject[funcName] = Joi.object()
      .meta({ title: `Falso Function: ${funcName}` })
      .description(
        'For information on what parameters this function takes, check the falso documentation: https://ngneat.github.io/falso/docs/getting-started'
      );
  }

  return falsoJoiObject;
};

const FakeDataPlugin = Joi.object({
  ...buildFalsoObject()
})
  .unknown(false)
  .meta({ title: 'Fake Data Plugin' })
  .description(
    'This plugin adds access to random realistic test data generation using falso. You can configure the parameters of each function in the config. \nFor more information, check our documentation: https://www.artillery.io/docs/reference/extensions/fake-data'
  );

module.exports = {
  FakeDataPlugin
};
