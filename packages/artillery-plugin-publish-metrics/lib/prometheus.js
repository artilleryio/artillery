const PromClient = require('prom-client');
const uuid = require("uuid");
const debug = require('debug')('plugin:publish-metrics:prometheus');

const COUNTERS_STATS = 'counters', // counter based stats incl.: requests.completed, scenarios.created, scenarios.completed, response code counts
  RPS_MEAN = 'rps_mean', // mean per/second rate of successful responses
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
      tags: []
    }, config)

    this.prometheusOpts = {
      pushgatewayUrl: config.pushgateway,
    };

    debug('ensuring pushgatewayUrl is configured');
    if (!this.prometheusOpts.pushgatewayUrl) {
      console.error(`prometheus pushgateway url not specified`);
    }

    debug('setting default labels');
    PromClient.register.setDefaultLabels(this.tagsToLabels(this.config.tags));

    this.registerMetrics()

    debug('creating pushgateway client using url: %s', this.prometheusOpts.pushgatewayUrl);
    this.pushgateway = new PromClient.Pushgateway(this.prometheusOpts.pushgatewayUrl);

    debug('configure sending metrics to pushgateway');
    this.sendMetrics(config, events, script)

    debug('init done');
  }

  registerMetrics() {
    this.countersStats = PromClient.register.getSingleMetric(COUNTERS_STATS) ||
      new PromClient.Counter({
        name: COUNTERS_STATS,
        help: 'counter based stats incl.: core.vusers.created.total, core.vusers.completed, engine.http.requests, etc..',
        labelNames: ['metric']
      });

    // this.rpsGauge = promClient.register.getSingleMetric(RPS_MEAN) ||
    //   new promClient.Gauge({
    //     name: RPS_MEAN,
    //     help: 'mean per/second rate of successful responses'
    //   });
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

      if (stats.counters) {
        for (const cKey in stats.counters) {
          const transformed = toPrometheusKey(cKey)
          this.countersStats.inc({metric: transformed}, stats.counters[cKey])
        }

        this.pushgateway.pushAdd({jobName: this.jobUUID.toString()}, function (err) {
          if (err) {
            console.log('Error pushing metrics to push gateway', err);
          }
        });
      }
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
