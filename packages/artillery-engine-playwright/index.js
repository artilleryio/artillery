const debug = require('debug')('engine:playwright');
const P = require('playwright');
const chromium = P.chromium;

class PlaywrightEngine {
  constructor(script) {
    debug('constructor');
    this.config = script.config;
    return this;
  }

  createScenario(spec, events) {
    debug('createScenario');
    debug(spec);

    const self = this;
    return async function scenario(initialContext, cb) {
      events.emit('started');
      const browser = await chromium.launch({
          headless: self.config.engines.playwright.headless === false ? false : true
        });
      debug('browser created');
      const context = await browser.newContext();
      debug('context created');
      const uniquePageLoadToTiming = {};
      try {
        const page = await context.newPage();
        debug('page created');

        page.on('domcontentloaded', async (page) => {
          const performanceTimingJson = await page.evaluate(() => JSON.stringify(window.performance.timing));
          const performanceTiming = JSON.parse(performanceTimingJson);

          if(uniquePageLoadToTiming[page.url()+performanceTiming.connectStart]) {
            return;
          } else {
            uniquePageLoadToTiming[page.url()+performanceTiming.connectStart] = performanceTiming;
          }

          debug('domcontentloaded:', page.url());
;
          const startToInteractive = performanceTiming.domInteractive - performanceTiming.navigationStart;

          events.emit('counter', 'engine.browser.page.domcontentloaded', 1);
          events.emit('counter', `engine.browser.page.domcontentloaded.${page.url()}`, 1)
          events.emit('histogram', 'engine.browser.page.dominteractive', startToInteractive);
          events.emit('histogram', `engine.browser.page.dominteractive.${page.url()}`, startToInteractive);
        });
        page.on('load', (page) => {
          debug('load:', page.url());
        });
        page.on('pageerror', (error) => {
          debug('pageerror:', page.url());
        });
        page.on('requestfinished', (request) => {
          const timing = request.timing();
          events.emit('histogram', 'engine.browser.http_response_time',timing.responseEnd - timing.responseStart);
        });
        page.on('response', (response) => {
        });

        const fn = self.config.processor[spec.flowFunction];
        await fn(page);
        if(cb) { cb(null, initialContext); }
        return initialContext;
      } catch(err) {
        if(cb) {
          cb(err, initialContext);
        } else {
          throw err;
        }
      } finally {
        await context.close();
        await browser.close();
      }
    }
  }
}

module.exports = PlaywrightEngine;
