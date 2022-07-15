module.exports = {
  setCookie
};

function setCookie(requestParams, context, ee, next) {
  requestParams.cookie = { "testCookie": "eyJ1aWQiOiIxNWMwMjNkMC02YmMxLTRkODEtYmQ1OS0wNjRmYjhmMGU0YTkifQ==;" };
  return next();
}
