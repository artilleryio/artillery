const got = require('got')
const debug = require('debug')('plugin:publish-metrics:newrelic');

function NewRelicReporter(config, events, script) {
    this.metricEndpoint = config.region && config.region === 'eu' 
        ? "https://metric-api.eu.newrelic.com/metric/v1" 
        : 'https://metric-api.newrelic.com/metric/v1';
    
    this.reqHeaders = {
        'Content-Type': 'application/json; charset=UTF-8',
        'Api-Key': config.licenceKey,
    };

    


    // TODO check in new relic the attributes?tags and how to call them -how they are called/used in the user platform 
    // TODO rewrite the formatConfig and rethink implementation 
    // TODO rethink the metric formater functions and their implementation
    // TODO turn to class



    debug('Creating NewRelicReporter with config');
    debug(Object.assign(config, { licenceKey: sanitize(config.licenceKey) }));
    
    this.config = formatConfig(config)

    debug('awaiting stats');
    events.on('stats', async (stats) => {
        let timestamp = Date.now();
        const interval = stats.lastCounterAt - stats.firstCounterAt;

        const rates = formatRatesForNewRelic(stats.rates, this.config);
        const counters = formatCountersForNewRelic(stats.counters, this.config);
        const summaries = formatSummariesForNewRelic(stats.summaries, this.config);

        const reqBody = createRequestBody (timestamp, interval, this.attributes, [...rates, ...counters, ...summaries]);
        await sendStats (this.metricEndpoint, this.reqHeaders, reqBody)

    });

    return this
}; 

// function formatStatsForNewRelic (stats, propertyName) {
//     const statMetrics = [];
//     let metric = {
//         type: propertyName === "counters" ? "count" : "gauge",
//         name: "",
//         value: null
//     }
//     for (const[label, value] of Object.entries(stats || {})) {
//         if (propertyName === "summaries") {
//             for (const [agreggation, valueNum] of Object.entries(stats || {})) {
//                 metric.name = `artillery.${label}.${agreggation}`;
//                 metric.value = valueNum
//                 statMetrics.push(metric)
//             };
//         } else {
//             metric.name = "artillery." + label
//             metric.value = value
//             statMetrics.push(metric)
//         }
//     }
//     return statMetrics
// }

function formatConfig(config) {
    const formatedConfig = Object.assign(
        {
            prefix: 'artillery.',
            excluded: [],
            includeOnly: [],
            attributes: []
        },
        config
    );
    
    // TODO change  
    formatedConfig.attributes = 
        config.attributes.reduce(
            (acc, attribute) => {
                 return acc[attribute.split(':')[0]] = attribute.split(':')[1]
            },
            {}
        ) ?? [];
    return formatedConfig
}

function formatCountersForNewRelic (counters, config) {
    debug('formating stats counters');
    const statMetrics = []
    for (const[name, value] of Object.entries(counters || {})) {
        if (shouldSendMetric(name, config.excluded, config.includeOnly)) {
            metric = {
                name: config.prefix + name,
                type: "count",
                value
            };
            statMetrics.push(metric)
        }
    }
    // debug('LIST OF COUNTERS SENT TO NR:', statMetrics)
    return statMetrics
}


function formatRatesForNewRelic (rates, config) {
    debug('formating stats rates');
    const statMetrics = []
    for (const[name, value] of Object.entries(rates || {})) {
        if (shouldSendMetric(name, config.excluded, config.includeOnly)) {
            metric = {
                name: config.prefix + name,
                type: "gauge",
                value
            };
            statMetrics.push(metric)
        };
    }
    return statMetrics
}

function formatSummariesForNewRelic (summaries, config) {
    debug('formating stats summaries');
    const statMetrics = []
    for (const[name, values] of Object.entries(summaries || {})) {
        if (shouldSendMetric(name, config.excluded, config.includeOnly)) {
            for (const [agreggation, value] of Object.entries(values)){
                metric = {
                    name: `${config.prefix}${name}.${agreggation}`,
                    type: "gauge",
                    value
                }
                statMetrics.push(metric)
            };
        
        };
    }
    return statMetrics
}

function createRequestBody (timestamp, interval, attributes, metrics) { 
    debug('creating request body')
    const body = [
        {
            common: {
                timestamp,
                "interval.ms": interval,
                attributes,
            },
            metrics
        }
    ]
    return body
}

async function sendStats(url, headers, body) {
    const options = {
        headers,
        json: body
    }
    debug('sending metrics to New Relic')
    try{
        const res = await got.post(url, options)
        if ( res.statusCode !== 202 ) {
            debug(`Status Code: ${res.statusCode}, ${res.statusMessage}`)
        }
    } catch (err) {
        debug(err)
    }
}

function sanitize(str) {
    return `${str.substring(0, 3)}********************${str.substring(str.length - 3, str.length)}`;
}

function shouldSendMetric (metricName, excluded, includeOnly) {
    if (excluded.includes(metricName)) {
        return
    };

    if (includeOnly.length > 0 && !includeOnly.includes(metricName)) {
        return
    }
    return true 
}


NewRelicReporter.prototype.cleanup = function (done) {
    done()
}

function createNewRelicReporter (config, events, script) {
   return new NewRelicReporter(config, events, script)
};

module.exports = {
    createNewRelicReporter
};

