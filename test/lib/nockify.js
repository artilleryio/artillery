'use strict';

var l = require('lodash');
var nock = require('nock');

module.exports = create;

function create(requests, config) {
  var scope = nock(config.target);
  scope.log(console.log);

  l.each(requests, function(requestSpec) {
    var verb = l.keys(requestSpec)[0];
    var params = requestSpec[verb];
    var defaultHeaders = lowcaseKeys(
      (config.defaults && config.defaults.headers) ?
        config.defaults.headers : {});
    var headers = l.extend(defaultHeaders,
      lowcaseKeys(params.headers));
    l.each(headers, function(v, k) {
      scope.matchHeader(k, v);
    });

    var args = [params.url];
    if (verb === 'post' || verb === 'put') {
      args.push(params.json ? params.json : params.body);
    }

    var responses = {
      'get': 200,
      'post': 201,
      'put': 204,
      'delete': 200
    };

    var response = responses[verb];

    scope[verb].apply(scope, args).reply(response);
  });

  return scope;
}

function lowcaseKeys(h) {
  return l.transform(h, function(result, v, k) {
    result[k.toLowerCase()] = v;
  });
}
