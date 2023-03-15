const got = require('got')
const debug = require('debug')('plugin:publish-metrics:newrelic');


class NewRelicReporter {
	constructor(config, events) {
		// set each config value as matching user config if exists, else default values
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
		
		// prepared endpoints for incoming sending events feature
		// this.eventsAPIEndpoint = this.config.region === 'eu' 
		// 		? 'https://insights-collector.eu01.nr-data.net' 
		// 		: 'https://insights-collector.newrelic.com';
		
		this.pendingRequests = 0;
		
		events.on('stats', async (stats) => {
			const timestamp = Date.now();
			const interval = Number(stats.lastCounterAt) - Number(stats.firstCounterAt);
			
			const rates = this.formatRatesForNewRelic(stats.rates, this.config);
			const counters = this.formatCountersForNewRelic(stats.counters, this.config);
			const summaries = this.formatSummariesForNewRelic(stats.summaries, this.config);
			
			const reqBody = this.createRequestBody(timestamp, interval, this.config.attributes, [...rates, ...counters, ...summaries]);
			await this.sendStats(this.metricsAPIEndpoint, this.config.licenseKey, reqBody);
		});
		
	};

	// packs stats.counters metrics that need to be sent to NR into format recognised by NR metric API
	formatCountersForNewRelic (counters, config) {
		const statMetrics = [];
		for (const[name, value] of Object.entries(counters || {})) {
			if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
				continue
			};

			const metric = {
				name: config.prefix + name,
				type: "count",
				value
			};
			statMetrics.push(metric);
		};

		return statMetrics;
	};
	
	// packs stats.rates metrics that need to be sent to NR into format recognised by NR metric API
	formatRatesForNewRelic (rates, config) {
		const statMetrics = [];
		for (const[name, value] of Object.entries(rates || {})) {
			if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
				continue
			};

			const metric = {
				name: config.prefix + name,
				type: "gauge",
				value
			};
			statMetrics.push(metric);
		};

		return statMetrics;
	};
	
	// packs stats.summaries metrics that need to be sent to NR into format recognised by NR metric API
	formatSummariesForNewRelic (summaries, config) {
		const statMetrics = [];
		for (const[name, values] of Object.entries(summaries || {})) {
			if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
				continue
			};

			for (const [agreggation, value] of Object.entries(values)){
				const metric = {
					name: `${config.prefix}${name}.${agreggation}`,
					type: "gauge",
					value
				};
				statMetrics.push(metric);
			};
		};

		return statMetrics;
	};
	
	// assembles metrics and info into req body format needed by NR metric API
	createRequestBody (timestamp, interval, attributeList, metrics) { 
		const parsedAttributes = {};
		if (attributeList.length > 0) {
			for (const item of attributeList) {
				const attribute = item.split(':');
				parsedAttributes[attribute[0]] = attribute[1];
			};
		};

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

		return body;
	};
	
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

		debug('sending metrics to New Relic');
		try{
			const res = await got.post(url, options);
			if ( res.statusCode !== 202 ) {
				debug(`Status Code: ${res.statusCode}, ${res.statusMessage}`);
			};
		} catch (err) {
			debug(err);
		};
		
		this.pendingRequests -= 1;
	};
	
	// checks if metric should be sent by screening for it in the excluded and includeOnly lists
	shouldSendMetric (metricName, excluded, includeOnly) {
		if (excluded.includes(metricName)) {
			return;
		};
		
		if (includeOnly.length > 0 && !includeOnly.includes(metricName)) {
			return;
		};

		return true;
	};

	async waitingForRequest() {
		while (this.pendingRequests > 0) {
			debug('Waiting for pending request ...');
			await new Promise((resolve) => setTimeout(resolve, 500));
		};
		
		debug('Pending requests done');
		return true;
	};

	cleanup(done) {
		debug('cleaning up');
		return this.waitingForRequest().then(done);
	};
	
};

function createNewRelicReporter (config, events, script) {
	return new NewRelicReporter(config, events, script);
};

module.exports = {
	createNewRelicReporter
};