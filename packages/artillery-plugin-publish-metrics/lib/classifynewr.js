const got = require('got')
const debug = require('debug')('plugin:publish-metrics:newrelic');


class NewRelicReporter {
	constructor(config, events) {
		// debug(Object.assign(config, { licenseKey: this.sanitize(config.licenseKey) }));

		this.config = {
			region: config.region || 'us',
			prefix: config.prefix || 'artillery.',
			excluded: config.excluded || [],
			includeOnly: config.includeOnly || [],
			attributes: config.attributes || [],
			licenseKey: config.licenseKey,
		};
		
		this.metricsAPIEndpoint = this.config.region === 'eu' 
        ? "https://metric-api.eu.newrelic.com/metric/v1"
        : 'https://metric-api.newrelic.com/metric/v1';
		
		this.eventsAPIEndpoint = this.config.region === 'eu' 
				? 'https://insights-collector.eu01.nr-data.net' 
				: 'https://insights-collector.newrelic.com';
		
		this.pendingRequests = 0;
		
		events.on('stats', async (stats) => {
			const timestamp = Date.now();
			const interval = Number(stats.lastCounterAt) - Number(stats.firstCounterAt);
			
			const rates = this.formatRatesForNewRelic(stats.rates, this.config);
			const counters = this.formatCountersForNewRelic(stats.counters, this.config);
			const summaries = this.formatSummariesForNewRelic(stats.summaries, this.config);
			
			const reqBody = this.createRequestBody(timestamp, interval, this.config.attributes, [...rates, ...counters, ...summaries]);
			await this.sendStats(this.metricsAPIEndpoint, this.config.licenseKey, reqBody)
			
		});
		
		debug('init done');
	}
	
	formatCountersForNewRelic (counters, config) {
		debug('formating stats counters');
		const statMetrics = []
		for (const[name, value] of Object.entries(counters || {})) {
			if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
				continue
			};
			const metric = {
				name: config.prefix + name,
				type: "count",
				value
			};
			statMetrics.push(metric)
		}
		return statMetrics
	}
	
	formatRatesForNewRelic (rates, config) {
		debug('formating stats rates');
		const statMetrics = []
		for (const[name, value] of Object.entries(rates || {})) {
			if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
				continue
			};
			const metric = {
				name: config.prefix + name,
				type: "gauge",
				value
			};
			statMetrics.push(metric)
		}
		return statMetrics
	}
	
	formatSummariesForNewRelic (summaries, config) {
		debug('formating stats summaries');
		const statMetrics = []
		for (const[name, values] of Object.entries(summaries || {})) {
			if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
				continue
			};
			for (const [agreggation, value] of Object.entries(values)){
				const metric = {
					name: `${config.prefix}${name}.${agreggation}`,
					type: "gauge",
					value
				}
				statMetrics.push(metric)
			};
		}
		return statMetrics
	}
	
	createRequestBody (timestamp, interval, attributeList, metrics) { 
		debug('creating request body')
		const parsedAttributes = {};
		if (attributeList.length > 0) {
			for (const item of attributeList) {
				const attribute = item.split(':')
				parsedAttributes[attribute[0]] = attribute[1]
			}
		}
		const body = [
			{
				common: {
					timestamp,
					'interval.ms': interval,
					attributes: parsedAttributes,
				},
				metrics
			}
		]
		return body
	}
	
	async sendStats(url, licenseKey, body) {
		this.pendingRequests += 1;
		const headers = {
			'Content-Type': 'application/json; charset=UTF-8',
			'Api-Key': licenseKey,
		};
		const options = {
			headers,
			json: body
		};
		debug('sending metrics to New Relic')
		try{
			const res = await got.post(url, options)
			if ( res.statusCode !== 202 ) {
				debug(`Status Code: ${res.statusCode}, ${res.statusMessage}`)
			}
		} catch (err) {
			debug(err)
		}
		
		this.pendingRequests -= 1;
	}
	
	shouldSendMetric (metricName, excluded, includeOnly) {
		if (excluded.includes(metricName)) {
			return
		};
		
		if (includeOnly.length > 0 && !includeOnly.includes(metricName)) {
			return
		}
		return true 
	}
	
	sanitize (str) {
    return `${str.substring(0, 3)}********************${str.substring(str.length - 3, str.length)}`;
	}

	async waitingForRequest() {
		while (this.pendingRequests > 0) {
			debug('Waiting for pending request ...');
			await new Promise((resolve) => setTimeout(resolve, 500));
		} ;
		
		debug('Pending requests done');
		return true;
	}

	cleanup(done) {
		debug('cleaning up');
		// done();
		return this.waitingForRequest().then(done);
	}
	
}

function createNewRelicReporter (config, events, script) {
	return new NewRelicReporter(config, events, script)
};

module.exports = {
	createNewRelicReporter
};






// const got = require('got')
// const debug = require('debug')('plugin:publish-metrics:newrelic');

// function NewRelicReporter(config, events, script) {
    // this.metricEndpoint = config.region && config.region === 'eu' 
    //     ? "https://metric-api.eu.newrelic.com/metric/v1" 
    //     : 'https://metric-api.newrelic.com/metric/v1';
    
//     this.reqHeaders = {
//         'Content-Type': 'application/json; charset=UTF-8',
//         'Api-Key': config.licenceKey,
//     };

    


//     // TODO check in new relic the attributes?tags and how to call them -how they are called/used in the user platform 
//     // TODO rewrite the formatConfig and rethink implementation 
//     // TODO rethink the metric formater functions and their implementation
//     // TODO turn to class



//     debug('Creating NewRelicReporter with config');
//     debug(Object.assign(config, { licenseKey: sanitize(config.licenseKey) }));
    
//     this.config = formatConfig(config)

//     debug('awaiting stats');
//     events.on('stats', async (stats) => {
//         let timestamp = Date.now();
//         const interval = stats.lastCounterAt - stats.firstCounterAt;

//         const rates = formatRatesForNewRelic(stats.rates, this.config);
//         const counters = formatCountersForNewRelic(stats.counters, this.config);
//         const summaries = formatSummariesForNewRelic(stats.summaries, this.config);

//         const reqBody = createRequestBody (timestamp, interval, this.config.attributes, [...rates, ...counters, ...summaries]);
//         await sendStats (this.metricEndpoint, this.reqHeaders, reqBody)

//     });

//     return this
// }; 

// // function formatStatsForNewRelic (stats, propertyName) {
// //     const statMetrics = [];
// //     let metric = {
// //         type: propertyName === "counters" ? "count" : "gauge",
// //         name: "",
// //         value: null
// //     }
// //     for (const[label, value] of Object.entries(stats || {})) {
// //         if (propertyName === "summaries") {
// //             for (const [agreggation, valueNum] of Object.entries(stats || {})) {
// //                 metric.name = `artillery.${label}.${agreggation}`;
// //                 metric.value = valueNum
// //                 statMetrics.push(metric)
// //             };
// //         } else {
// //             metric.name = "artillery." + label
// //             metric.value = value
// //             statMetrics.push(metric)
// //         }
// //     }
// //     return statMetrics
// // }

// function formatConfig(config) {
//     const formatedConfig = Object.assign(
//         {
//             prefix: 'artillery.',
//             excluded: [],
//             includeOnly: [],
//             attributes: []
//         },
//         config
//     );
    
//     if (formatedConfig.attributes.length > 0) {
//         formatedConfig.attributes = {};
//         for (const attribute of config.attributes) {
//             formatedConfig.attributes[attribute.split(':')[0]] = attribute.split(':')[1]
//         }
//     }
//     return formatedConfig
// }

// function formatCountersForNewRelic (counters, config) {
//     debug('formating stats counters');
//     const statMetrics = []
//     for (const[name, value] of Object.entries(counters || {})) {
//         if (shouldSendMetric(name, config.excluded, config.includeOnly)) {
//             metric = {
//                 name: config.prefix + name,
//                 type: "count",
//                 value
//             };
//             statMetrics.push(metric)
//         }
//     }
//     // debug('LIST OF COUNTERS SENT TO NR:', statMetrics)
//     return statMetrics
// }


// function formatRatesForNewRelic (rates, config) {
//     debug('formating stats rates');
//     const statMetrics = []
//     for (const[name, value] of Object.entries(rates || {})) {
//         if (shouldSendMetric(name, config.excluded, config.includeOnly)) {
//             metric = {
//                 name: config.prefix + name,
//                 type: "gauge",
//                 value
//             };
//             statMetrics.push(metric)
//         };
//     }
//     return statMetrics
// }

// function formatSummariesForNewRelic (summaries, config) {
//     debug('formating stats summaries');
//     const statMetrics = []
//     for (const[name, values] of Object.entries(summaries || {})) {
//         if (shouldSendMetric(name, config.excluded, config.includeOnly)) {
//             for (const [agreggation, value] of Object.entries(values)){
//                 metric = {
//                     name: `${config.prefix}${name}.${agreggation}`,
//                     type: "gauge",
//                     value
//                 }
//                 statMetrics.push(metric)
//             };
        
//         };
//     }
//     return statMetrics
// }

// function createRequestBody (timestamp, interval, attributes, metrics) { 
//     debug('creating request body')
//     const body = [
//         {
//             common: {
//                 timestamp,
//                 "interval.ms": interval,
//                 attributes,
//             },
//             metrics
//         }
//     ]
//     return body
// }

// async function sendStats(url, headers, body) {
//     const options = {
//         headers,
//         json: body
//     }
//     debug('sending metrics to New Relic')
//     try{
//         const res = await got.post(url, options)
//         if ( res.statusCode !== 202 ) {
//             debug(`Status Code: ${res.statusCode}, ${res.statusMessage}`)
//         }
//     } catch (err) {
//         debug(err)
//     }
// }

function sanitize(str) {
    return `${str.substring(0, 3)}********************${str.substring(str.length - 3, str.length)}`;
}

// function shouldSendMetric (metricName, excluded, includeOnly) {
//     if (excluded.includes(metricName)) {
//         return
//     };

//     if (includeOnly.length > 0 && !includeOnly.includes(metricName)) {
//         return
//     }
//     return true 
// }


// NewRelicReporter.prototype.cleanup = function (done) {
//     done()
// }

// function createNewRelicReporter (config, events, script) {
//    return new NewRelicReporter(config, events, script)
// };

// module.exports = {
//     createNewRelicReporter
// };

