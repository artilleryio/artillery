const PromClient = require('prom-client');
const uuid = require("uuid");
const debug = require('debug')('plugin:publish-metrics:prometheus');

const COUNTERS_STATS = 'counters', // counters stats
  RATES_STATES = 'rates', // rates stats
  SUMMARIES_STATES = 'summaries', // summaries stats
  ERRORS = 'errors_across_requests';


function toPrometheusKey(candidate) {
  return candidate.
    replaceAll('.', '_').
    replaceAll(/\s/g, '_').
    toLowerCase();
}

class PrometheusReporter {

  constructor(config, events, script) {
    this.jobUUID = uuid.v4();
    this.config = Object.assign({
      tags: [],
      prefix: 'artillery'
    }, config)

    this.prometheusOpts = {
      pushgatewayUrl: config.pushgateway,
    };

    debug('ensuring pushgatewayUrl is configured');
    if (!this.prometheusOpts.pushgatewayUrl) {
      console.error(`the prometheus [pushgateway] url was not specified`);
    }

    debug('setting default labels');
    PromClient.register.setDefaultLabels(this.tagsToLabels(this.config.tags));

    this.registerMetrics(this.config.prefix)

    debug('creating pushgateway client using url: %s', this.prometheusOpts.pushgatewayUrl);
    this.pushgateway = new PromClient.Pushgateway(this.prometheusOpts.pushgatewayUrl);

    debug('configure sending metrics to pushgateway');
    this.sendMetrics(config, events, script)

    debug('init done');
  }

  registerMetrics(prefix) {
    this.countersStats = PromClient.register.getSingleMetric(`${prefix}_${COUNTERS_STATS}`) ||
      new PromClient.Counter({
        name: `${prefix}_${COUNTERS_STATS}`,
        help: 'counter based stats e.g.: core_vusers_created_total, engine.http.requests',
        labelNames: ['metric']
      });

    this.ratesStats = PromClient.register.getSingleMetric(`${prefix}_${RATES_STATES}`) ||
      new PromClient.Gauge({
        name: `${prefix}_${RATES_STATES}`,
        help: 'rates based stats e.g.: engine_http_request_rate',
        labelNames: ['metric'],
      });

    this.summariesStats = PromClient.register.getSingleMetric(`${prefix}_${SUMMARIES_STATES}`) ||
      new PromClient.Gauge({
        name: `${prefix}_${SUMMARIES_STATES}`,
        help: 'summaries based stats e.g.: engine_http_response_time_min, engine_http_response_time_p999',
        labelNames: ['metric'],
      });
    //
    // this.errorsCounter = promClient.register.getSingleMetric(ERRORS) ||
    //   new promClient.Counter({
    //     name: VUSER_STATS,
    //     help: 'any errors encountered',
    //     labelNames: ['error_code']
    //   });

    debug('setupMeasurements');
  }

  tagsToLabels(tags){
    let labels = {};
    tags.forEach(tag => {
      let parts = tag.split(":")
      labels[parts[0]] = parts[1]
    })
    return labels;
  }

  sendMetrics(config, events, script) {
    events.on('stats', (stats) => {
      debug('On stats event: %O', stats);

      if (stats[COUNTERS_STATS]) {
        for (const cKey in stats[COUNTERS_STATS]) {
          const transformed = toPrometheusKey(cKey)
          this.countersStats.inc({metric: transformed}, stats[COUNTERS_STATS][cKey])
        }
      }

      if (stats[RATES_STATES]){
        for (const rKey in stats[RATES_STATES]) {
          const transformed = toPrometheusKey(rKey)
          this.ratesStats.set({metric: transformed}, stats[RATES_STATES][rKey])
        }
      }

      if (stats[SUMMARIES_STATES]){
        for (const sKey in stats[SUMMARIES_STATES]) {
          let readings = stats[SUMMARIES_STATES][sKey];
          for (const readingKey in readings) {
            const transformed = `${toPrometheusKey(sKey)}_${readingKey}`
            this.summariesStats.set({metric: transformed}, readings[readingKey])
          }
        }
      }

      this.pushgateway.pushAdd({jobName: this.jobUUID.toString()}, function (err) {
        if (err) {
          console.log('Error pushing metrics to push gateway', err);
        }
      });
    });
  }

  cleanup(done) {
    debug('cleaning up');
    return done();
  }
}

function createPrometheusReporter(config, events, script) {
  return new PrometheusReporter(config, events, script);
}

module.exports = {
  createPrometheusReporter,
};
