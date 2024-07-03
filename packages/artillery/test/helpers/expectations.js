const _checkSummaries = (t, summaries, type) => {
  for (const summaryMetric of Object.keys(summaries)) {
    for (const aggregation of Object.keys(summaries[summaryMetric])) {
      if (
        summaries[summaryMetric][aggregation] < 0 ||
        summaries[summaryMetric][aggregation] === null
      ) {
        t.fail(
          `Found invalid value in ${type} summaries: ${summaryMetric}.${aggregation} = ${summaries[summaryMetric][aggregation]}`
        );
      }
    }
  }
};

const checkForNegativeValues = (t, report) => {
  const aggregateSummaries = report.aggregate?.summaries;

  if (!aggregateSummaries || Object.keys(aggregateSummaries).length === 0) {
    t.fail('No aggregate summaries found in the report');
  }

  _checkSummaries(t, aggregateSummaries, 'aggregate');

  if (!report.intermediate || report.intermediate.length === 0) {
    t.fail('No intermediate summaries found in the report');
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
    t.fail('No aggregate counters found in the report');
  }

  let intermediateCounters = {};

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
      t.fail(
        `Aggregate counter sum mismatch for ${key}. Aggregate ${aggregateCounters[key]} != Intermediate ${intermediateCounters[key]}`
      );
    }
  }
};

module.exports = {
  checkForNegativeValues,
  checkAggregateCounterSums
};
