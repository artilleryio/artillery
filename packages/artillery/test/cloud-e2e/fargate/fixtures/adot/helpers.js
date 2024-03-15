'use strict';

const sleep = require('../../../../helpers/sleep.js');
const got = require('got');
const AWS = require('aws-sdk');
const xray = new AWS.XRay({ region: 'us-east-1' });

module.exports = {
  getTestId,
  getDatadogSpans,
  getXRayTraces
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

async function getXRayTraces(testId) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 30 * 60 * 1000); // 30 min ago
  const filterExpression = `annotation.test_id = "${testId}"`;

  let summariesData;
  try {
    summariesData = await new Promise((resolve, reject) => {
      xray.getTraceSummaries(
        {
          StartTime: startTime,
          EndTime: endTime,
          FilterExpression: filterExpression,
          TimeRangeType: 'Event'
        },
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
  } catch (err) {
    console.error('Error fetching trace summaries from AWS X-Ray: ', err);
  }

  const traceSummaries = summariesData.TraceSummaries;
  const traceIds = traceSummaries.map((trace) => trace.Id);
  console.log('TRACE IDS: ', traceIds);

  let fullTraceData;
  try {
    fullTraceData = await new Promise((resolve, reject) => {
      xray.batchGetTraces(
        {
          TraceIds: traceIds
        },
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
  } catch (err) {
    console.error('Error fetching full trace data from AWS X-Ray: ', err);
  }

  const traceMap = fullTraceData.Traces.map((trace) =>
    trace.Segments.map((span) => JSON.parse(span.Document))
  );

  return traceMap;
}
