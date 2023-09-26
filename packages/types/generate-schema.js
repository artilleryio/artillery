const fs = require('fs');
const path = require('path');
const parse = require('joi-to-json');
const { schema } = require('./schema/index');

const jsonSchema = parse(schema, 'json', {}, { includeSchemaDialect: true });

fs.writeFileSync(
  path.join(__dirname, './schema.json'),
  JSON.stringify(jsonSchema, null, 2)
);
