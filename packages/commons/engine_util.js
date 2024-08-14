/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const async = require('async');
const debug = require('debug')('engine_util');
const deepForEach = require('deep-for-each');
const espree = require('espree');
const L = require('lodash');
const vm = require('vm');
const ms = require('ms');
const A = require('async');
const { JSONPath: jsonpath } = require('jsonpath-plus');
const cheerio = require('cheerio');
const jitter = require('./jitter').jitter;

let xmlCapture;
try {
  xmlCapture = require('artillery-xml-capture');
} catch (e) {
  xmlCapture = null;
}

// TODO Write tests

module.exports = {
  createThink: createThink,
  createLoopWithCount: createLoopWithCount,
  createParallel: createParallel,
  isProbableEnough: isProbableEnough,
  template: template,
  captureOrMatch,
  evil: evil,
  ensurePropertyIsAList: ensurePropertyIsAList,
  _renderVariables: renderVariables
};

function createThink(requestSpec, opts) {
  opts = opts || {};

  let thinkspec = requestSpec.think;

  let f = function think(context, callback) {
    let templatedThink = template(thinkspec, context);
    let thinktime = Number.isInteger(L.toNumber(templatedThink))
      ? ms(`${templatedThink}s`)
      : ms(templatedThink);

    if (typeof thinktime == 'undefined') {
      throw new Error(`Invalid think time: ${templatedThink || thinkspec}`);
    }

    if (requestSpec.jitter || opts.jitter) {
      thinktime = jitter(`${thinktime}:${requestSpec.jitter || opts.jitter}`);
    }
    debug(
      'think %s, %s, %s -> %s',
      requestSpec.think,
      requestSpec.jitter,
      opts.jitter,
      thinktime
    );
    setTimeout(function () {
      callback(null, context);
    }, thinktime);
  };

  return f;
}

// "count" can be an integer (negative or positive) or a string defining a range
// like "1-15"
function createLoopWithCount(count, steps, opts) {
  return function aLoop(context, callback) {
    let count2 = count;
    if (typeof count === 'string') {
      count2 = template(count, context);
    }

    let from = parseLoopCount(count2).from;
    let to = parseLoopCount(count2).to;

    let i = from;
    let newContext = context;
    let loopIndexVar = (opts && opts.loopValue) || '$loopCount';
    let loopElementVar = (opts && opts.loopElement) || '$loopElement';
    // Should we stop early because the value of "over" is not an array
    let abortEarly = false;

    let overValues = null;
    let loopValue = i; // default to the current iteration of the loop, ie same as $loopCount
    if (typeof opts.overValues !== 'undefined') {
      if (opts.overValues && typeof opts.overValues === 'object') {
        overValues = opts.overValues;
        loopValue = overValues[i];
      } else if (opts.overValues && typeof opts.overValues === 'string') {
        overValues = L.get(context.vars, opts.overValues);
        if (L.isArray(overValues)) {
          loopValue = overValues[i];
        } else {
          abortEarly = true;
        }
      }
    }

    newContext.vars[loopElementVar] = loopValue;
    newContext.vars[loopIndexVar] = i;

    let shouldContinue = true;

    A.whilst(
      function test() {
        if (abortEarly) {
          return false;
        }
        if (opts.whileTrue) {
          return shouldContinue;
        }
        if (overValues !== null) {
          return i !== overValues.length;
        } else {
          return i < to || to === -1;
        }
      },
      function repeated(cb) {
        let zero = function (cb2) {
          return cb2(null, newContext);
        };
        let steps2 = L.flatten([zero, steps]);

        A.waterfall(steps2, function (err, context2) {
          if (err) {
            return cb(err, context2);
          }
          i++;
          newContext = context2;

          newContext.vars[loopIndexVar]++;
          if (overValues !== null) {
            newContext.vars[loopElementVar] = overValues[i];
          }

          if (opts.whileTrue) {
            opts.whileTrue(context2, function done(b) {
              shouldContinue = b;
              return cb(err, context2);
            });
          } else {
            return cb(err, context2);
          }
        });
      },
      function (err, finalContext) {
        if (typeof finalContext === 'undefined') {
          // this happens if test() returns false immediately, e.g. with
          // nested loops where one of the inner loops goes over an
          // empty array
          return callback(err, newContext);
        }
        return callback(err, finalContext);
      }
    );
  };
}

function createParallel(steps, opts) {
  let limit = (opts && opts.limitValue) || 100;

  return function aParallel(context, callback) {
    let newContext = context;
    let newCallback = callback;

    // Remap the steps array to pass the context into each step.
    let newSteps = L.map(steps, function (step) {
      return function (callback) {
        step(newContext, callback);
      };
    });

    // Run each of the steps in parallel.
    A.parallelLimit(newSteps, limit, function (err, finalContext) {
      // We don't need to do anything with the array of contexts returned from each step at the moment.
      return newCallback(err, newContext);
    });
  };
}

function isProbableEnough(obj) {
  if (typeof obj.probability === 'undefined') {
    return true;
  }

  let probability = Number(obj.probability) || 0;
  if (probability > 100) {
    probability = 100;
  }

  let r = L.random(100);
  return r < probability;
}

function template(o, context, inPlace) {
  let result;

  if (typeof o === 'undefined') {
    return undefined;
  }

  if (o && (o.constructor === Object || o.constructor === Array)) {
    if (!inPlace) {
      result = L.cloneDeep(o);
    } else {
      result = o;
    }
    templateObjectOrArray(result, context);
  } else if (typeof o === 'string') {
    if (!/{{/.test(o)) {
      return o;
    }
    const funcCallRegex =
      /{{\s*(\$[A-Za-z0-9_]+\s*\(\s*[A-Za-z0-9_,\s]*\s*\))\s*}}/;
    let match = o.match(funcCallRegex);
    if (match) {
      // This looks like it could be a function call:
      const syntax = espree.parse(match[1]);
      // TODO: Use a proper schema for what we expect here
      if (
        syntax.body &&
        syntax.body.length === 1 &&
        syntax.body[0].type === 'ExpressionStatement'
      ) {
        let funcName = syntax.body[0].expression.callee.name;
        let args = L.map(syntax.body[0].expression.arguments, function (arg) {
          return arg.value;
        });
        if (funcName in context.funcs) {
          return template(
            o.replace(funcCallRegex, context.funcs[funcName].apply(null, args)),
            context
          );
        }
      }
    } else {
      if (!o.match(/{{/)) {
        return o;
      }

      result = renderVariables(o, context.vars);
    }
  } else {
    return o;
  }

  return result;
}

// Mutates the object in place
function templateObjectOrArray(o, context) {
  deepForEach(o, (value, key, subj, path) => {
    const newPath = template(path, context, true);

    let newValue;
    if (value && value.constructor !== Object && value.constructor !== Array) {
      newValue = template(value, context, true);
    } else {
      newValue = value;
    }

    debug(
      `path = ${path} ; value = ${JSON.stringify(
        value
      )} (${typeof value}) ; (subj type: ${subj.length ? 'list' : 'hash'
      }) ; newValue = ${JSON.stringify(newValue)} ; newPath = ${newPath}`
    );

    // If path has changed, we need to unset the original path and
    // explicitly walk down the new subtree from this path:
    if (path !== newPath) {
      L.unset(o, path);
      newValue = template(value, context, true);
    }

    if (newPath.endsWith(key)) {
      const keyIndex = newPath.lastIndexOf(key);
      const prefix = newPath.substr(0, keyIndex - 1);
      L.set(o, `${prefix}["${key}"]`, newValue);
    } else {
      L.set(o, newPath, newValue);
    }
  });
}

function renderVariables(str, vars) {
  const RX = /{{{?[\s$\w\.\[\]\'\"-]+}}}?/g;
  let rxmatch;
  let result = str.substring(0, str.length);

  // Special case for handling integer/boolean/object substitution:
  //
  // Does the template string contain one variable and nothing else?
  // e.g.: "{{ myvar }" or "{{    myvar }", but NOT " {{ myvar }"
  // If so, we treat it as a special case.
  const matches = str.match(RX);
  if (matches && matches.length === 1) {
    if (matches[0] === str) {
      // there's nothing else in the template but the variable
      const varName = str.replace(/{/g, '').replace(/}/g, '').trim();
      return sanitiseValue(L.get(vars, varName));
    }
  }

  while (result.search(RX) > -1) {
    let templateStr = result.match(RX)[0];
    const varName = templateStr.replace(/{/g, '').replace(/}/g, '').trim();

    let varValue = L.get(vars, varName);

    if (typeof varValue === 'object') {
      varValue = JSON.stringify(varValue);
    }
    result = result.replace(templateStr, varValue);
  }

  return result;
}

// Presume code is valid JS code (i.e. that it has been checked elsewhere)
function evil(sandbox, code) {
  let context = vm.createContext(sandbox);
  let script = new vm.Script(code);
  try {
    return script.runInContext(context);
  } catch (e) {
    return null;
  }
}

function parseLoopCount(countSpec) {
  let from = 0;
  let to = 0;

  if (typeof countSpec === 'number') {
    from = 0;
    to = countSpec;
  } else if (typeof countSpec === 'string') {
    if (isNaN(Number(countSpec))) {
      if (/\d\-\d/.test(countSpec)) {
        from = Number(countSpec.split('-')[0]);
        to = Number(countSpec.split('-')[1]);
      } else {
        to = 0;
      }
    } else {
      to = Number(countSpec);
    }
  } else {
    to = 0;
  }

  return { from: from, to: to };
}

function isCaptureFailed(v, defaultStrict) {
  const noValue =
    typeof v.value === 'undefined' ||
    v.value === '' ||
    typeof v.error !== 'undefined';

  if (!noValue) {
    return false;
  }

  return !(
    (typeof defaultStrict === 'undefined' && v.strict === false) ||
    (defaultStrict === true && v.strict === false) ||
    (defaultStrict === false && typeof v.strict === 'undefined') ||
    (defaultStrict === false && v.strict === false)
  );
}

// Helper function to wrap an object's property in a list if it's
// defined, or set it to an empty list if not.
function ensurePropertyIsAList(obj, prop) {
  if (Array.isArray(obj[prop])) {
    return obj;
  }

  obj[prop] = [].concat(typeof obj[prop] === 'undefined' ? [] : obj[prop]);
  return obj;
}

function captureOrMatch(params, response, context, done) {
  if (
    (!params.capture || params.capture.length === 0) &&
    (!params.match || params.match.length === 0)
  ) {
    return done(null, null);
  }

  let result = {
    captures: {},
    matches: {},
    failedCaptures: false
  };

  // Objects updated in place the first time this runs:
  ensurePropertyIsAList(params, 'capture');
  ensurePropertyIsAList(params, 'match');

  let specs = params.capture.concat(params.match);

  async.eachSeries(
    specs,
    function (spec, next) {
      let parsedSpec = parseSpec(spec, response);
      let parser = parsedSpec.parser;
      let extractor = parsedSpec.extractor;
      let expr = parsedSpec.expr;

      // are we looking at body or headers:
      var content = response.body;
      if (spec.header) {
        content = response.headers;
      }

      parser(content, function (err, doc) {
        if (err) {
          if (spec.as) {
            result.captures[spec.as] = {
              error: err,
              strict: spec.strict
            };
            result.captures[spec.as].failed = isCaptureFailed(
              result.captures[spec.as],
              context._defaultStrictCapture
            );
          } else {
            result.matches[spec.expr] = {
              error: err,
              strict: spec.strict
            };
          }
          return next(null);
        }

        let extractedValue = extractor(doc, template(expr, context), spec);

        if (spec.value !== undefined) {
          // this is a match spec
          let expected = template(spec.value, context);
          debug(
            'match: %s, expected: %s, got: %s',
            expr,
            expected,
            extractedValue
          );
          if (extractedValue !== expected) {
            result.matches[expr] = {
              success: false,
              expected: expected,
              got: extractedValue,
              expression: expr,
              strict: spec.strict
            };
          } else {
            result.matches.expr = {
              success: true,
              expected: expected,
              expression: expr
            };
          }
          return next(null);
        }

        if (spec.as) {
          // this is a capture
          debug('capture: %s = %s', spec.as, extractedValue);
          result.captures[spec.as] = {
            value: extractedValue,
            strict: spec.strict
          };

          result.captures[spec.as].failed = isCaptureFailed(
            result.captures[spec.as],
            context._defaultStrictCapture
          );
        }

        return next(null);
      });
    },
    function (err) {
      if (err) {
        return done(err, null);
      } else {
        return done(null, result);
      }
    }
  );
}

function parseSpec(spec, response) {
  let parser;
  let extractor;
  let expr;

  if (spec.json) {
    parser = parseJSON;
    extractor = extractJSONPath;
    expr = spec.json;
  } else if (xmlCapture && spec.xpath) {
    parser = xmlCapture.parseXML;
    extractor = xmlCapture.extractXPath;
    expr = spec.xpath;
  } else if (spec.regexp) {
    parser = dummyParser;
    extractor = extractRegExp;
    expr = spec.regexp;
  } else if (spec.header) {
    parser = dummyParser;
    extractor = extractHeader;
    expr = spec.header;
  } else if (spec.selector) {
    parser = dummyParser;
    extractor = extractCheerio;
    expr = spec.selector;
  } else {
    if (isJSON(response)) {
      parser = parseJSON;
      extractor = extractJSONPath;
      expr = spec.json;
    } else if (xmlCapture && isXML(response)) {
      parser = xmlCapture.parseXML;
      extractor = xmlCapture.extractXPath;
      expr = spec.xpath;
    } else {
      // We really don't know what to do here.
      parser = dummyParser;
      extractor = dummyExtractor;
      expr = '';
    }
  }

  return { parser: parser, extractor: extractor, expr: expr };
}

/*
 * Wrap JSON.parse in a callback
 */
function parseJSON(body, callback) {
  let r = null;
  let err = null;

  try {
    if (typeof body === 'string') {
      r = JSON.parse(body);
    } else {
      r = body;
    }
  } catch (e) {
    err = e;
  }

  return callback(err, r);
}

function dummyParser(body, callback) {
  return callback(null, body);
}

// doc is a JSON object
function extractJSONPath(doc, expr, opts) {
  // typeof null is 'object' hence the explicit check here
  if (typeof doc !== 'object' || doc === null) {
    return '';
  }

  let results;

  try {
    results = jsonpath({ path: expr, json: doc, wrap: opts.multiple ?? true });
  } catch (queryErr) {
    debug(queryErr);
  }

  if (!results) {
    return '';
  }

  if (opts.multiple === false) {
    return results;
  }

  if (results.length > 1) {
    return results[randomInt(0, results.length - 1)];
  } else {
    return results[0];
  }
}

// doc is a string or an object (body parsed by Request when headers indicate JSON)
function extractRegExp(doc, expr, opts) {
  let group = opts.group;
  let flags = opts.flags;
  let str;
  if (typeof doc === 'string') {
    str = doc;
  } else {
    str = JSON.stringify(doc); // FIXME: not the same string as the one we got from the server
  }
  let rx;
  if (flags) {
    rx = new RegExp(expr, flags);
  } else {
    rx = new RegExp(expr);
  }
  let match = rx.exec(str);
  if (!match) {
    return '';
  }

  // Captures named group (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Named_capturing_group)
  if (group && match.groups) {
    return match.groups[group];
    // Captures integer index defined group since those don't show up in match.groups
  } else if (group && match[group]) {
    return match[group];
    // Defaults to first match if found and no group defined
  } else if (match[0]) {
    return match[0];
    // If no match returns empty string
  } else {
    return '';
  }
}

function extractHeader(headers, headerName) {
  return headers[headerName] || '';
}

function extractCheerio(doc, expr, opts) {
  let $ = cheerio.load(doc);
  let els = $(expr);
  let i = 0;
  if (typeof opts.index !== 'undefined') {
    if (opts.index === 'random') {
      i = Math.ceil(Math.random() * els.get().length - 1);
    } else if (opts.index === 'last') {
      i = els.get().length() - 1;
    } else if (typeof Number(opts.index) === 'number') {
      i = Number(opts.index);
    }
  }
  return els.slice(i, i + 1).attr(opts.attr);
}

function dummyExtractor() {
  return '';
}

/*
 * Given a response object determine if it's JSON
 */
function isJSON(res) {
  debug('isJSON: content-type = %s', res.headers['content-type']);
  return (
    res.headers['content-type'] &&
    /^application\/json/.test(res.headers['content-type'])
  );
}

/*
 * Given a response object determine if it's some kind of XML
 */
function isXML(res) {
  return (
    res.headers['content-type'] &&
    (/^[a-zA-Z]+\/xml/.test(res.headers['content-type']) ||
      /^[a-zA-Z]+\/[a-zA-Z]+\+xml/.test(res.headers['content-type']))
  );
}

function randomInt(low, high) {
  return Math.floor(Math.random() * (high - low + 1) + low);
}

function sanitiseValue(value) {
  if (value === 0 || value === false || value === null || value === undefined)
    return value;
  return value ? value : '';
}
