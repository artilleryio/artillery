
import * as path from 'path';
import Handlebars from 'handlebars';
import * as fs from 'fs';

export const loadCustomJsonPayload = async function(req, vuContext, _events) {
  if (!req.jsonFromFile) {
    return;
  }

  const relativePath = req.jsonFromFile.path;
  const fullPath = path.join(vuContext.vars.$dirname, relativePath);
  const contents = fs.readFileSync(fullPath, 'utf8');

  if (!req.jsonFromFile.withVariables) {
    const json = JSON.parse(contents);
    req.json = json;
  } else {
    const template = Handlebars.compile(contents);
    const result = template(req.jsonFromFile.withVariables);
    const json = JSON.parse(result);
    req.json = json;
  }
}