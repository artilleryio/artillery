'use strict';

const uuid = require('uuid');
const _ = require('lodash');

function $randomNumber(min, max) {
  return _.random(min, max);
}

function $randomString(length) {
  return Math.random().toString(36).substr(2, length);
}

function $uuid() {
  return uuid.v4();
}

function $dateNow() {
  return Date.now();
}

module.exports = {
  $randomNumber,
  $randomString,
  $uuid,
  $dateNow
};