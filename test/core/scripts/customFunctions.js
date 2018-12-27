const uuid = require('uuid');

module.exports = {
  $uuid,
  $dateNow
};

function $uuid() {
  return uuid.v4();
}

function $dateNow() {
  return Date.now();
}