'use strict';

const sleep = require('../../../../helpers/sleep.js');
const got = require('got');

module.exports = {
  getTestId,
  getDatadogSpans
};

function getTestId(outputString) {
  const regex = /Test run ID: \S+/;
  const match = outputString.match(regex);
  return match[0].replace('Test run ID: ', '');
}

async function getDatadogSpans(apiKey, appKey, testId, expectedTotalSpans) {
  const url = 'https://api.datadoghq.com/api/v2/spans/events/search';
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'DD-API-KEY': apiKey,
    'DD-APPLICATION-KEY': appKey
  };

  const body = {
    data: {
      attributes: {
        filter: {
          from: 'now-15m',
          query: '@test_id:' + testId,
          to: 'now'
        },
        options: {
          timezone: 'GMT'
        },
        page: {
          limit: 500
        },
        sort: 'timestamp'
      },
      type: 'search_request'
    }
  };

  // Wait for spans to be available in Datadog
  // Delay is 30s, to avoid hitting rate limits
  const maxRetry = 12;
  const delay = 30000;

  let spanList = [];
  let retryNum = 0;
  while (spanList.length < expectedTotalSpans && retryNum <= maxRetry) {
    console.log(`ADOT Datadog test: Awaiting spans... (retry #${retryNum})`);

    spanList = await got
      .post(url, {
        headers: headers,
        json: body
      })
      .then((response) => JSON.parse(response.body).data);
    await sleep(delay);
    retryNum++;
  }

  return spanList;
}
