const assert = require('node:assert');

// tap-style assertion helpers for suites migrated to node:test.
// (node:test's t has no equal/ok/fail/hasProps/has - these throw via
// node:assert instead, which node:test reports as test failures.)

// Every property name in `props` must exist on `obj` (tap's t.hasProps)
const hasProps = (obj, props, msg) => {
  for (const prop of props) {
    assert.ok(
      obj != null && Object.hasOwn(obj, prop),
      `${msg} (missing property: ${prop})`
    );
  }
};

// `obj` must contain every key/value pair of `expected` (tap's t.has/t.match
// for plain-object patterns - a deep subset check)
const hasSubset = (obj, expected, msg) => {
  for (const [key, value] of Object.entries(expected)) {
    assert.deepStrictEqual(
      obj?.[key],
      value,
      `${msg} (mismatch for key: ${key})`
    );
  }
};

const _checkSummaries = (t, summaries, type) => {
  for (const summaryMetric of Object.keys(summaries)) {
    for (const aggregation of Object.keys(summaries[summaryMetric])) {
      if (
        summaries[summaryMetric][aggregation] < 0 ||
        summaries[summaryMetric][aggregation] === null
      ) {
        assert.fail(
          `Found invalid value in ${type} summaries: ${summaryMetric}.${aggregation} = ${summaries[summaryMetric][aggregation]}`
        );
      }
    }
  }
};

const checkForNegativeValues = (t, report) => {
  const aggregateSummaries = report.aggregate?.summaries;

  if (!aggregateSummaries || Object.keys(aggregateSummaries).length === 0) {
    assert.fail('No aggregate summaries found in the report');
  }

  _checkSummaries(t, aggregateSummaries, 'aggregate');

  if (!report.intermediate || report.intermediate.length === 0) {
    assert.fail('No intermediate summaries found in the report');
  }

  for (const intermediate of report.intermediate) {
    const intermediateSummaries = intermediate.summaries;
    if (
      !intermediateSummaries ||
      Object.keys(intermediateSummaries).length === 0
    ) {
      continue;
    }
    _checkSummaries(t, intermediateSummaries, 'intermediate');
  }
};

const checkAggregateCounterSums = (t, report) => {
  const aggregateCounters = report.aggregate?.counters;

  if (!aggregateCounters || Object.keys(aggregateCounters).length === 0) {
    assert.fail('No aggregate counters found in the report');
  }

  const intermediateCounters = {};

  for (const intermediate of report.intermediate) {
    for (const key in intermediate.counters) {
      if (intermediateCounters[key]) {
        intermediateCounters[key] += intermediate.counters[key];
      } else {
        intermediateCounters[key] = intermediate.counters[key];
      }
    }
  }

  for (const key in aggregateCounters) {
    if (aggregateCounters[key] !== intermediateCounters[key]) {
      assert.fail(
        `Aggregate counter sum mismatch for ${key}. Aggregate ${aggregateCounters[key]} != Intermediate ${intermediateCounters[key]}`
      );
    }
  }
};

module.exports = {
  checkForNegativeValues,
  checkAggregateCounterSums,
  hasProps,
  hasSubset
};
