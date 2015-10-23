'use strict';

var debug = require('debug')('engine_util');
var mustache = require('mustache');
var traverse = require('traverse');
var esprima = require('esprima');
var _ = require('lodash');

module.exports = {
  createThink: createThink,
  template: template
};

function createThink(requestSpec) {
  var thinktime = requestSpec.think * 1000;

  var f = function(context, callback) {
    debug('think %s -> %s', requestSpec.think, thinktime);
    setTimeout(function() {
      callback(null, context);
    }, thinktime);
  };

  return f;
}

function template(o, context) {
  var result;
  if (typeof o === 'object') {
    result = traverse(o).map(function(x) {

      if (typeof x === 'string') {
        this.update(template(x, context));
      } else {
        return x;
      }
    });
  } else {
    var funcCallRegex = /{{\s*(\$[A-Za-z0-9_]+\s*\(\s*.*\s*\))\s*}}/;
    var match = o.match(funcCallRegex);
    if (match) {
      // This looks like it could be a function call:
      var syntax = esprima.parse(match[1]);
      // TODO: Use a proper schema for what we expect here
      if (syntax.body && syntax.body.length === 1 &&
          syntax.body[0].type === 'ExpressionStatement') {
        var funcName = syntax.body[0].expression.callee.name;
        var args = _.map(syntax.body[0].expression.arguments, function(arg) {
          return arg.value;
        });
        if (funcName in context.funcs) {
          return template(o.replace(funcCallRegex, context.funcs[funcName].apply(null, args)), context);
        }
      }
    } else {
      result = mustache.render(o, context.vars);
    }
  }
  return result;
}
