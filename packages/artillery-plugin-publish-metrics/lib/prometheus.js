const http = require('http');
const PromClient = require('prom-client');
const uuid = require('uuid');
const debug = require('debug')('plugin:publish-metrics:prometheus');

const COUNTERS_STATS = 'counters', // counters stats
  RATES_STATS = 'rates', // rates stats
  SUMMARIES_STATS = 'summaries'; // summaries stats includes errors

class PrometheusReporter {

  constructor(config, events) {
    this.workerID = process.env.WORKER_ID || uuid.v4();
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
    this.pushgateway = new PromClient.Pushgateway(this.prometheusOpts.pushgatewayUrl,{
      timeout: 5000, //Set the request timeout to 5000ms
      agent: new http.Agent({
        keepAlive: true,
        keepAliveMsec: 10000,
        maxSockets: 10,
      }),
    });

    debug('configure sending metrics to pushgateway');
    this.sendMetrics(config, events)

    debug('init done');
  }

  registerMetrics(prefix) {
    this.countersStats = PromClient.register.getSingleMetric(`${prefix}_${COUNTERS_STATS}`) ||
      new PromClient.Counter({
        name: `${prefix}_${COUNTERS_STATS}`,
        help: 'counter based stats e.g.: core_vusers_created_total, engine.http.requests',
        labelNames: ['metric']
      });

    this.ratesStats = PromClient.register.getSingleMetric(`${prefix}_${RATES_STATS}`) ||
      new PromClient.Gauge({
        name: `${prefix}_${RATES_STATS}`,
        help: 'rates based stats e.g.: engine_http_request_rate',
        labelNames: ['metric'],
      });

    this.summariesStats = PromClient.register.getSingleMetric(`${prefix}_${SUMMARIES_STATS}`) ||
      new PromClient.Gauge({
        name: `${prefix}_${SUMMARIES_STATS}`,
        help: 'summaries based stats e.g.: engine_http_response_time_min, engine_http_response_time_p999',
        labelNames: ['metric'],
      });

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

  toPrometheusKey(candidate) {
    return candidate.
      replace(/\s|\./g, '_').
      toLowerCase();
  }

  sendMetrics(config, events) {
    let that = this;

    events.on('stats', (stats) => {
      debug('On stats event: %O', stats);

      if (stats[COUNTERS_STATS]) {
        for (const cKey in stats[COUNTERS_STATS]) {
          const transformed = that.toPrometheusKey(cKey)
          this.countersStats.inc({metric: transformed}, stats[COUNTERS_STATS][cKey])
        }
      }

      if (stats[RATES_STATS]){
        for (const rKey in stats[RATES_STATS]) {
          const transformed = that.toPrometheusKey(rKey)
          this.ratesStats.set({metric: transformed}, stats[RATES_STATS][rKey])
        }
      }

      if (stats[SUMMARIES_STATS]){
        for (const sKey in stats[SUMMARIES_STATS]) {
          let readings = stats[SUMMARIES_STATS][sKey];
          for (const readingKey in readings) {
            const transformed = `${that.toPrometheusKey(sKey)}_${readingKey}`
            this.summariesStats.set({metric: transformed}, readings[readingKey])
          }
        }
      }

      // noinspection JSCheckFunctionSignatures
      this.pushgateway.pushAdd({ jobName: this.workerID.toString()})
        .then(() => {
          debug("metrics pushed successfully")
        })
        .catch(err => {
          console.log('Error pushing metrics to push gateway', err);
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
