const { test } = require('tap');
const { replaceMetricsWithHashes, hashString } = require('../utils');

test('works with boolean operators', async (t) => {
  const metricA = 'someMetricA';
  const metricB = 'someMetricB';
  const originalExpression = `${metricA} < 20 and ${metricB} < 30`;
  const modifiedExpression = `'${hashString(metricA)}' < 20 and '${hashString(
    metricB
  )}' < 30`;

  const result = replaceMetricsWithHashes(
    [metricA, metricB],
    originalExpression
  );

  t.equal(result, modifiedExpression);
});

test('works with built-in functions, even if a metric name includes it', async (t) => {
  const metricA = 'someMetricA';
  const metricB = 'vusers.random.ceil';
  const originalExpression = `(ceil(${metricA}) < 20) or random(${metricB}) == 30`;
  const modifiedExpression = `(ceil('${hashString(
    metricA
  )}') < 20) or random('${hashString(metricB)}') == 30`;

  const result = replaceMetricsWithHashes(
    [metricA, metricB],
    originalExpression
  );

  t.equal(result, modifiedExpression);
});

test('works with boolean operators without spaces', async (t) => {
  const metricA = 'someMetricA';
  const metricB = 'someMetricB';
  const originalExpression = `${metricA}<20 and ${metricB}<30`;
  const modifiedExpression = `'${hashString(metricA)}'<20 and '${hashString(
    metricB
  )}'<30`;

  const result = replaceMetricsWithHashes(
    [metricA, metricB],
    originalExpression
  );

  t.equal(result, modifiedExpression);
});

test('works with ternary boolean operator', async (t) => {
  const metricA = 'someMetricA';
  const originalExpression = `${metricA}<20 ? 30 : 40`;
  const modifiedExpression = `'${hashString(metricA)}'<20 ? 30 : 40`;

  const result = replaceMetricsWithHashes([metricA], originalExpression);

  t.equal(result, modifiedExpression);
});

test('works with explicit operator precedence (parentheses) with spaces', async (t) => {
  const metricA = 'vusers.created';
  const metricB = 'vusers.completed';
  const metricC = 'vusers.created';
  const metricD = 'vusers.skipped';
  const metricE = 'http.request_rate';
  const originalExpression = `( ( ( ${metricA} - ${metricB}) / floor(${metricC}) * 100 ) + ${metricD} ) <= 0 or ${metricE} > 0`;
  const modifiedExpression = `( ( ( '${hashString(metricA)}' - '${hashString(
    metricB
  )}') / floor('${hashString(metricC)}') * 100 ) + '${hashString(
    metricD
  )}' ) <= 0 or '${hashString(metricE)}' > 0`;

  const result = replaceMetricsWithHashes(
    [metricA, metricB, metricC, metricD, metricE],
    originalExpression
  );

  t.equal(result, modifiedExpression);
});

test('works with explicit operator precedence (parentheses) without spaces', async (t) => {
  const metricA = 'vusers.created';
  const metricB = 'vusers.completed';
  const metricC = 'vusers.created';
  const metricD = 'vusers.skipped';
  const metricE = 'http.request_rate';
  const originalExpression = `(((${metricA}-${metricB})/floor(${metricC})*100)+${metricD})<= 0 or ${metricE}>0`;
  const modifiedExpression = `((('${hashString(metricA)}'-'${hashString(
    metricB
  )}')/floor('${hashString(metricC)}')*100)+'${hashString(
    metricD
  )}')<= 0 or '${hashString(metricE)}'>0`;

  const result = replaceMetricsWithHashes(
    [metricA, metricB, metricC, metricD, metricE],
    originalExpression
  );

  t.equal(result, modifiedExpression);
});

test('works with complex url expressions', async (t) => {
  const metricA = 'browser.page.FCP.https://www.artillery.io/abc.p99';
  const metricB = 'browser.page.TTFB.https://www.artillery.io/docs.min';
  const originalExpression = `${metricA} < 20 and ${metricB} < 30`;
  const modifiedExpression = `'${hashString(metricA)}' < 20 and '${hashString(
    metricB
  )}' < 30`;

  const result = replaceMetricsWithHashes(
    [metricA, metricB],
    originalExpression
  );

  t.equal(result, modifiedExpression);
});

test('works with space in name', async (t) => {
  const metricA = 'vusers.created_by_name.Scenario with some space';
  const metricB = 'vusers.created_by_name.Other named scenario';
  const originalExpression = `${metricA} /${metricB} > 20 or ${metricB}>= 30`;
  const modifiedExpression = `'${hashString(metricA)}' /'${hashString(
    metricB
  )}' > 20 or '${hashString(metricB)}'>= 30`;

  const result = replaceMetricsWithHashes(
    [metricA, metricB],
    originalExpression
  );

  t.equal(result, modifiedExpression);
});

test('works when metric names include special named operators and we use those special operators', async (t) => {
  const metricA = 'vusers.created_by_name.andy'; //relevant because andy includes "and" in the name
  const metricB = 'vusers.created_by_name.nottinghill'; //relevant because nottinghill includes "not" in the name
  const metricC = 'custom.orders'; //relevant because orders includes "or" in the name

  const originalExpression = `(not ${metricA} < 100 and not ${metricB} < 100) or ${metricC} >= 300`;
  const modifiedExpression = `(not '${hashString(
    metricA
  )}' < 100 and not '${hashString(metricB)}' < 100) or '${hashString(
    metricC
  )}' >= 300`;

  const result = replaceMetricsWithHashes(
    [metricA, metricB, metricC],
    originalExpression
  );

  t.equal(result, modifiedExpression);
});
