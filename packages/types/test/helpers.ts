import Ajv from 'ajv';
import * as yaml from 'js-yaml';

const schema = require('../schema.json');

const ajv = new Ajv({
  validateSchema: true,
  allErrors: true,
  allowUnionTypes: true,
  allowMatchingProperties: true,
  strictTypes: false
});

export function validateTestScript(scriptText: string) {
  // Make sure that the schema we load is valid.
  if (!ajv.validateSchema(schema)) {
    console.error(ajv.errors);
    throw new Error('Failed to validate Artillery JSON schema');
  }

  const script = yaml.load(scriptText);
  ajv.validate(schema, script);

  return ajv.errors || [];
}
