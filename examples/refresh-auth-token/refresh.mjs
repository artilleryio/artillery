const TOKEN_REFRESH_INTERVAL = 1000 * 5; // 5 seconds

export async function refreshTokenIfNeeded(_requestParams, vuContext, _events) {
  if (!vuContext.tokenExpiryTime || vuContext.tokenExpiryTime < Date.now()) {
    console.log('Fetching new token');
    const token = await fetchToken();
    vuContext.tokenExpiryTime = Date.now() + TOKEN_REFRESH_INTERVAL;
    vuContext.vars.authToken = token;
    console.log('  expiry time:', vuContext.tokenExpiryTime);
    console.log('  new token:', vuContext.vars.authToken);
  }
}

async function fetchToken() {
  // Return a dummy token for the sake of this example. A real-world
  // implementation would usually fetch a token from an external endpoint.
  return `token-${Date.now()}`;
}
