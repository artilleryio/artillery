/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('engine_util');
const hogan = require('hogan.js');
const traverse = require('traverse');
const esprima = require('esprima');
const L = require('lodash');
const vm = require('vm');
const A = require('async');

module.exports = {
  createThink: createThink,
  createLoopWithCount: createLoopWithCount,
  isProbableEnough: isProbableEnough,
  template: template,
  evil: evil
};

function createThink(requestSpec) {
  let thinktime = requestSpec.think * 1000;

  let f = function(context, callback) {
    debug('think %s -> %s', requestSpec.think, thinktime);
    setTimeout(function() {
      callback(null, context);
    }, thinktime);
  };

  return f;
}

// "count" can be an integer (negative or positive) or a string defining a range
// like "1-15"
function createLoopWithCount(count, steps) {
  let from = parseLoopCount(count).from;
  let to = parseLoopCount(count).to;

  return function aLoop(context, callback) {
    let i = from;
    let newContext = context;
    newContext.vars.$loopCount = i;
    A.whilst(
      function test() {
        return i < to || to === -1;
      },
      function repeated(cb) {
        let zero = function(cb2) {
          return cb2(null, newContext);
        };
        let steps2 = L.flatten([zero, steps]);
        A.waterfall(steps2, function(err, context2) {
          i++;
          newContext = context2;
          newContext.vars.$loopCount++;
          return cb(err, context2);
        });
      },
      function(err, finalContext) {
        return callback(err, finalContext);
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

function template(o, context) {
  let result;
  if (typeof o === 'object') {
    result = traverse(o).map(function(x) {

      if (typeof x === 'string') {
        this.update(template(x, context));
      } else {
        return x;
      }
    });
  } else {
    if (!/{{/.test(o)) {
      return o;
    }
    const funcCallRegex = /{{\s*(\$[A-Za-z0-9_]+\s*\(\s*.*\s*\))\s*}}/;
    let match = o.match(funcCallRegex);
    if (match) {
      // This looks like it could be a function call:
      const syntax = esprima.parse(match[1]);
      // TODO: Use a proper schema for what we expect here
      if (syntax.body && syntax.body.length === 1 &&
          syntax.body[0].type === 'ExpressionStatement') {
        let funcName = syntax.body[0].expression.callee.name;
        let args = L.map(syntax.body[0].expression.arguments, function(arg) {
          return arg.value;
        });
        if (funcName in context.funcs) {
          return template(o.replace(funcCallRegex, context.funcs[funcName].apply(null, args)), context);
        }
      }
    } else {
      if (!o.match(/{{/)) {
        return o;
      }

      result = (hogan.compile(o)).render(context.vars);
    }
  }
  return result;
}

// Presume code is valid JS code (i.e. that it has been checked elsewhere)
function evil(sandbox, code) {
  let context = vm.createContext(sandbox);
  let script = new vm.Script(code);
  return script.runInContext(context);
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
