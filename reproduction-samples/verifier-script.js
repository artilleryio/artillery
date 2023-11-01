const sampleReport = require('../sample.json')

const intermediates = sampleReport.intermediate
const total200InAgreggate = sampleReport.aggregate.counters['http.codes.200']

//get the total of 200 codes from the intermediate reports
let total200InIntermediates = 0;
intermediates.forEach(intermediate => total200InIntermediates += intermediate.counters['http.codes.200'])
const codes200DIFF = total200InAgreggate - total200InIntermediates


// get timestamps of first and last metric in aggregate
const firstAggregateMetricAt = sampleReport.aggregate.firstMetricAt
const lastAggregateMetricAt = sampleReport.aggregate.lastMetricAt

// get timestamps of first and last metric in intermediates
const firstIntermediateMetricAt = Math.min(...intermediates.map((i) => i.firstMetricAt))
// console.log(intermediates.map((i) => i.firstMetricAt))
const lastIntermediateMetricAt = Math.max(...intermediates.map((i) => i.lastMetricAt))
// console.log(lastIntermediateMetricAt)

// difference in time periods - indicating intermediate report/s / data missing
const totalTimePeriodInAggregate = lastAggregateMetricAt - firstAggregateMetricAt 
const totalTimePeriodInIntermediates = lastIntermediateMetricAt - firstIntermediateMetricAt
const timeDIFF = totalTimePeriodInAggregate - totalTimePeriodInIntermediates

//log all values
const x = {total200InAgreggate, total200InIntermediates, codes200DIFF, totalTimePeriodInAggregate, totalTimePeriodInIntermediates, timeDIFF}

for (const [name,value] of Object.entries(x))
  console.log(name,': ', value);