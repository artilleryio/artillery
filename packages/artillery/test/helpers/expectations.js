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

module.exports = {
  checkForNegativeValues
};
