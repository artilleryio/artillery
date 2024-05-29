# refresh-auth-token example

This example shows how you can refresh an authentication token used by individual VUs as they're running.

It's a solution to the problem of the VUs needing to use a short-lived authentication token (or another short-lived value) in a test that runs longer than the expiration window of the token.

It works as follows:

1. A `refreshTokenIfNeeded` function is set to be called before each request
   in a scenario. The function checks whether a token has already been created,
   and if it needs to be refreshed. The expiry window is set to 5s in this example.
2. If a token needs to be created for the first time  or refreshed, the `fetchToken()` function is called, and the result is stored in the `authToken` template variable.
3. The `authToken` template variable is used as the value of `x-auth-token` header on the requests in the scenario.
4. The VU scenario includes a 10s pause that will cause the existing token to expire and get refreshed before the last call to the `/armadillo` endpoint is made.

To adapt the example for your use-case:

1. Increase the value of `TOKEN_REFRESH_INTERVAL` to match the expiry window of the tokens in your application.
2. Update `fetchToken()` function with the logic to fetch a token, e.g. by making a HTTP call to an external API endpoint.

Run the example:

```sh
DEBUG=http artillery run refresh.yml
```

You should see output that looks similar to:

```
Test run id: tdhbk_bm63epyfgx8yt4atfethqmea34pxm_h9t9
Fetching new token
  expiry time: 1716981850536
  new token: token-1716981845535
2024-05-29T11:24:05.840Z http request: {
  "url": "http://asciizoo.artillery.io:8080/dino",
  "method": "GET",
  "headers": {
    "user-agent": "Artillery (https://artillery.io)",
    "x-auth-token": "token-1716981845535"
  }
}
2024-05-29T11:24:05.913Z http request: {
  "url": "http://asciizoo.artillery.io:8080/pony",
  "method": "GET",
  "headers": {
    "user-agent": "Artillery (https://artillery.io)",
    "x-auth-token": "token-1716981845535"
  }
}
Used auth token: token-1716981845535
Fetching new token
  expiry time: 1716981860917
  new token: token-1716981855917
2024-05-29T11:24:16.627Z http request: {
  "url": "http://asciizoo.artillery.io:8080/armadillo",
  "method": "GET",
  "headers": {
    "user-agent": "Artillery (https://artillery.io)",
    "x-auth-token": "token-1716981855917"
  }
}
Now used a refreshed auth token: token-1716981855917
```

You can see that a new token was created before any requests were made by the VU, and that the first two requests (to `/dino` and `/pony` endpoints) used that token.

Because of the 10s pause in the VU scenario the token was deemed as expired, and was refreshed before the third call to `/armadillo` endpoint was made. The call to `/armadillo` endpoint used the refreshed value of the token.
