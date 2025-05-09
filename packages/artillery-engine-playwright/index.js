const debug = require('debug')('engine:playwright');
const { chromium, selectors } = require('playwright');

class PlaywrightEngine {
  constructor(script) {
    debug('constructor');
    this.target = script.config.target;

    this.config = script.config?.engines?.playwright || {};
    this.processor = script.config.processor || {};

    if (script.$rewriteMetricName) {
      this.processor.$rewriteMetricName = script.$rewriteMetricName;
    }

    this.launchOptions = this.config.launchOptions || {};
    this.contextOptions = this.config.contextOptions || {};

    this.tracing = global.artillery.OTEL_TRACING_ENABLED || false;

    this.defaultNavigationTimeout =
      (isNaN(Number(this.config.defaultNavigationTimeout))
        ? 30
        : Number(this.config.defaultNavigationTimeout)) * 1000;
    this.defaultTimeout =
      (isNaN(Number(this.config.defaultTimeout))
        ? 30
        : Number(this.config.defaultTimeout)) * 1000;

    this.testIdAttribute = this.config.testIdAttribute;

    this.aggregateByName =
      script.config.engines.playwright.aggregateByName || false;
    this.extendedMetrics =
      typeof script.config.engines.playwright.extendedMetrics !== 'undefined';
    this.showAllPageMetrics =
      typeof script.config.engines.playwright.showAllPageMetrics !==
      'undefined';

    this.useSeparateBrowserPerVU =
      typeof script.config.engines.playwright.useSeparateBrowserPerVU ===
      'boolean'
        ? script.config.engines.playwright.useSeparateBrowserPerVU
        : false;

    if (!this.processor.$rewriteMetricName) {
      this.processor.$rewriteMetricName = function (name, _type) {
        return name;
      };
    }

    //
    // Tracing:
    // Note that these variables are shared across VUs *within* a single worker thread, as each
    // worker creates its own instance of the engine.

    // Playwright tracing is disabled if:
    // - trace is not set
    // - trace is set to false
    // - trace is set to an object with enabled = false
    this.tracingConfig =
      typeof this.config.trace === 'object'
        ? this.config.trace
        : {
            enabled: false
          };
    if (typeof this.config.trace === 'boolean') {
      this.tracingConfig.enabled = this.config.trace;
    }
    this.enablePlaywrightTracing = this.tracingConfig.enabled !== false;

    this.tracesRecordedCount = 0; // total count of traces recorded so far
    this.MAX_TRACE_RECORDINGS = this.tracingConfig.maxTraceRecordings || 360; // total limit on traces we'll record

    // We use this to make sure only one VU is recording at one time:
    this.MAX_CONCURRENT_RECORDINGS =
      this.tracingConfig.maxConcurrentRecordings || 5; // maximum number of VUs that can record at the same time
    this.vusRecording = 0; // number of VUs currently recording

    //
    // We use this to limit the number of recordings that we save:
    //
    this.lastTraceRecordedTime = 0; // timestamp of last saved recording
    // Minimum interval between saving new recordings. Add randomness to avoid multiple workers
    // saving multiple recordings at around the same time which would likely be redundant.
    // Interval is between 1-5 minutes
    this.TRACE_RECORDING_INTERVAL_MSEC =
      this.tracingConfig.recordingIntervalSec * 1000 ||
      1000 * 60 * Math.ceil(Math.random() * 5);

    this.traceOutputDir =
      process.env.PLAYWRIGHT_TRACING_OUTPUT_DIR ||
      `/tmp/${global.artillery.testRunId}`;
    return this;
  }

  createScenario(spec, events) {
    debug('createScenario');
    debug(spec);

    const self = this;

    function getName(url) {
      return self.aggregateByName && spec.name ? spec.name : url;
    }

    const step = async (stepName, userActions) => {
      const startedTime = Date.now();
      await userActions();
      const difference = Date.now() - startedTime;

      events.emit(
        'histogram',
        self.processor.$rewriteMetricName(
          `browser.step.${stepName}`,
          'histogram'
        ),
        difference
      );
    };

    return async function scenario(initialContext, cb) {
      events.emit('started');
      const launchOptions = Object.assign(
        {},
        {
          headless: true,
          args: ['--enable-precise-memory-info', '--disable-dev-shm-usage']
        },
        self.launchOptions
      );

      if (process.env.WORKER_ID) {
        if (!launchOptions.headless) {
          // Running inside a cloud worker, e.g. on AWS Fargate. Force headless mode
          console.log(
            'Running inside a cloud worker. Forcing Playwright headless mode to true'
          );
          launchOptions.headless = true;
        }
      }

      const contextOptions = {
        baseURL: self.target,
        ...self.contextOptions
      };

      let browser;
      if (self.useSeparateBrowserPerVU) {
        browser = await chromium.launch(launchOptions);
        debug('new browser created');
      } else {
        if (!global.artillery.__browser) {
          global.artillery.__browser = await chromium.launch(launchOptions);
          debug('shared browser created');
        }
        browser = global.artillery.__browser;
      }

      const context = await browser.newContext(contextOptions);

      if (
        self.vusRecording < self.MAX_CONCURRENT_RECORDINGS &&
        self.enablePlaywrightTracing &&
        self.tracesRecordedCount < self.MAX_TRACE_RECORDINGS
      ) {
        self.vusRecording++;
        initialContext.vars.isRecording = true; // used by the VU to discard the trace if needed
        const tracePath = `${self.traceOutputDir}/trace-${
          initialContext.vars.$testId
        }-${initialContext.vars.$uuid}-${Date.now()}.zip`;
        initialContext.vars.__tracePath = tracePath;
        await context.tracing.start({ screenshots: true, snapshots: true });
      }

      context.setDefaultNavigationTimeout(self.defaultNavigationTimeout);
      context.setDefaultTimeout(self.defaultTimeout);
      if (self.testIdAttribute) {
        selectors.setTestIdAttribute(self.testIdAttribute);
      }
      debug('context created');

      const uniquePageLoadToTiming = {};
      try {
        // UMD module inlined from the NPM version of https://github.com/GoogleChrome/web-vitals (web-vitals.umd.js):
        const WEB_VITALS_SCRIPT =
          '!function(e,n){"object"==typeof exports&&"undefined"!=typeof module?n(exports):"function"==typeof define&&define.amd?define(["exports"],n):n((e="undefined"!=typeof globalThis?globalThis:e||self).webVitals={})}(this,(function(e){"use strict";var n,t,i,r,o,a=-1,c=function(e){addEventListener("pageshow",(function(n){n.persisted&&(a=n.timeStamp,e(n))}),!0)},u=function(){return window.performance&&performance.getEntriesByType&&performance.getEntriesByType("navigation")[0]},s=function(){var e=u();return e&&e.activationStart||0},f=function(e,n){var t=u(),i="navigate";return a>=0?i="back-forward-cache":t&&(document.prerendering||s()>0?i="prerender":document.wasDiscarded?i="restore":t.type&&(i=t.type.replace(/_/g,"-"))),{name:e,value:void 0===n?-1:n,rating:"good",delta:0,entries:[],id:"v3-".concat(Date.now(),"-").concat(Math.floor(8999999999999*Math.random())+1e12),navigationType:i}},d=function(e,n,t){try{if(PerformanceObserver.supportedEntryTypes.includes(e)){var i=new PerformanceObserver((function(e){Promise.resolve().then((function(){n(e.getEntries())}))}));return i.observe(Object.assign({type:e,buffered:!0},t||{})),i}}catch(e){}},l=function(e,n,t,i){var r,o;return function(a){n.value>=0&&(a||i)&&((o=n.value-(r||0))||void 0===r)&&(r=n.value,n.delta=o,n.rating=function(e,n){return e>n[1]?"poor":e>n[0]?"needs-improvement":"good"}(n.value,t),e(n))}},p=function(e){requestAnimationFrame((function(){return requestAnimationFrame((function(){return e()}))}))},v=function(e){var n=function(n){"pagehide"!==n.type&&"hidden"!==document.visibilityState||e(n)};addEventListener("visibilitychange",n,!0),addEventListener("pagehide",n,!0)},m=function(e){var n=!1;return function(t){n||(e(t),n=!0)}},h=-1,g=function(){return"hidden"!==document.visibilityState||document.prerendering?1/0:0},T=function(e){"hidden"===document.visibilityState&&h>-1&&(h="visibilitychange"===e.type?e.timeStamp:0,C())},y=function(){addEventListener("visibilitychange",T,!0),addEventListener("prerenderingchange",T,!0)},C=function(){removeEventListener("visibilitychange",T,!0),removeEventListener("prerenderingchange",T,!0)},E=function(){return h<0&&(h=g(),y(),c((function(){setTimeout((function(){h=g(),y()}),0)}))),{get firstHiddenTime(){return h}}},L=function(e){document.prerendering?addEventListener("prerenderingchange",(function(){return e()}),!0):e()},b=[1800,3e3],S=function(e,n){n=n||{},L((function(){var t,i=E(),r=f("FCP"),o=d("paint",(function(e){e.forEach((function(e){"first-contentful-paint"===e.name&&(o.disconnect(),e.startTime<i.firstHiddenTime&&(r.value=Math.max(e.startTime-s(),0),r.entries.push(e),t(!0)))}))}));o&&(t=l(e,r,b,n.reportAllChanges),c((function(i){r=f("FCP"),t=l(e,r,b,n.reportAllChanges),p((function(){r.value=performance.now()-i.timeStamp,t(!0)}))})))}))},w=[.1,.25],P=function(e,n){n=n||{},S(m((function(){var t,i=f("CLS",0),r=0,o=[],a=function(e){e.forEach((function(e){if(!e.hadRecentInput){var n=o[0],t=o[o.length-1];r&&e.startTime-t.startTime<1e3&&e.startTime-n.startTime<5e3?(r+=e.value,o.push(e)):(r=e.value,o=[e])}})),r>i.value&&(i.value=r,i.entries=o,t())},u=d("layout-shift",a);u&&(t=l(e,i,w,n.reportAllChanges),v((function(){a(u.takeRecords()),t(!0)})),c((function(){r=0,i=f("CLS",0),t=l(e,i,w,n.reportAllChanges),p((function(){return t()}))})),setTimeout(t,0))})))},F={passive:!0,capture:!0},I=new Date,A=function(e,r){n||(n=r,t=e,i=new Date,k(removeEventListener),M())},M=function(){if(t>=0&&t<i-I){var e={entryType:"first-input",name:n.type,target:n.target,cancelable:n.cancelable,startTime:n.timeStamp,processingStart:n.timeStamp+t};r.forEach((function(n){n(e)})),r=[]}},D=function(e){if(e.cancelable){var n=(e.timeStamp>1e12?new Date:performance.now())-e.timeStamp;"pointerdown"==e.type?function(e,n){var t=function(){A(e,n),r()},i=function(){r()},r=function(){removeEventListener("pointerup",t,F),removeEventListener("pointercancel",i,F)};addEventListener("pointerup",t,F),addEventListener("pointercancel",i,F)}(n,e):A(n,e)}},k=function(e){["mousedown","keydown","touchstart","pointerdown"].forEach((function(n){return e(n,D,F)}))},x=[100,300],B=function(e,i){i=i||{},L((function(){var o,a=E(),u=f("FID"),s=function(e){e.startTime<a.firstHiddenTime&&(u.value=e.processingStart-e.startTime,u.entries.push(e),o(!0))},p=function(e){e.forEach(s)},h=d("first-input",p);o=l(e,u,x,i.reportAllChanges),h&&v(m((function(){p(h.takeRecords()),h.disconnect()}))),h&&c((function(){var a;u=f("FID"),o=l(e,u,x,i.reportAllChanges),r=[],t=-1,n=null,k(addEventListener),a=s,r.push(a),M()}))}))},N=0,R=1/0,H=0,O=function(e){e.forEach((function(e){e.interactionId&&(R=Math.min(R,e.interactionId),H=Math.max(H,e.interactionId),N=H?(H-R)/7+1:0)}))},j=function(){return o?N:performance.interactionCount||0},_=function(){"interactionCount"in performance||o||(o=d("event",O,{type:"event",buffered:!0,durationThreshold:0}))},q=[200,500],V=0,z=function(){return j()-V},G=[],J={},K=function(e){var n=G[G.length-1],t=J[e.interactionId];if(t||G.length<10||e.duration>n.latency){if(t)t.entries.push(e),t.latency=Math.max(t.latency,e.duration);else{var i={id:e.interactionId,latency:e.duration,entries:[e]};J[i.id]=i,G.push(i)}G.sort((function(e,n){return n.latency-e.latency})),G.splice(10).forEach((function(e){delete J[e.id]}))}},Q=function(e,n){n=n||{},L((function(){_();var t,i=f("INP"),r=function(e){e.forEach((function(e){(e.interactionId&&K(e),"first-input"===e.entryType)&&(!G.some((function(n){return n.entries.some((function(n){return e.duration===n.duration&&e.startTime===n.startTime}))}))&&K(e))}));var n,r=(n=Math.min(G.length-1,Math.floor(z()/50)),G[n]);r&&r.latency!==i.value&&(i.value=r.latency,i.entries=r.entries,t())},o=d("event",r,{durationThreshold:n.durationThreshold||40});t=l(e,i,q,n.reportAllChanges),o&&(o.observe({type:"first-input",buffered:!0}),v((function(){r(o.takeRecords()),i.value<0&&z()>0&&(i.value=0,i.entries=[]),t(!0)})),c((function(){G=[],V=j(),i=f("INP"),t=l(e,i,q,n.reportAllChanges)})))}))},U=[2500,4e3],W={},X=function(e,n){n=n||{},L((function(){var t,i=E(),r=f("LCP"),o=function(e){var n=e[e.length-1];n&&n.startTime<i.firstHiddenTime&&(r.value=Math.max(n.startTime-s(),0),r.entries=[n],t())},a=d("largest-contentful-paint",o);if(a){t=l(e,r,U,n.reportAllChanges);var u=m((function(){W[r.id]||(o(a.takeRecords()),a.disconnect(),W[r.id]=!0,t(!0))}));["keydown","click"].forEach((function(e){addEventListener(e,u,!0)})),v(u),c((function(i){r=f("LCP"),t=l(e,r,U,n.reportAllChanges),p((function(){r.value=performance.now()-i.timeStamp,W[r.id]=!0,t(!0)}))}))}}))},Y=[800,1800],Z=function e(n){document.prerendering?L((function(){return e(n)})):"complete"!==document.readyState?addEventListener("load",(function(){return e(n)}),!0):setTimeout(n,0)},$=function(e,n){n=n||{};var t=f("TTFB"),i=l(e,t,Y,n.reportAllChanges);Z((function(){var r=u();if(r){var o=r.responseStart;if(o<=0||o>performance.now())return;t.value=Math.max(o-s(),0),t.entries=[r],i(!0),c((function(){t=f("TTFB",0),(i=l(e,t,Y,n.reportAllChanges))(!0)}))}}))};e.CLSThresholds=w,e.FCPThresholds=b,e.FIDThresholds=x,e.INPThresholds=q,e.LCPThresholds=U,e.TTFBThresholds=Y,e.getCLS=P,e.getFCP=S,e.getFID=B,e.getINP=Q,e.getLCP=X,e.getTTFB=$,e.onCLS=P,e.onFCP=S,e.onFID=B,e.onINP=Q,e.onLCP=X,e.onTTFB=$,Object.defineProperty(e,"__esModule",{value:!0})}));';
        await context.addInitScript(WEB_VITALS_SCRIPT);
        await context.addInitScript(() => {
          ['onLCP', 'onFCP', 'onCLS', 'onTTFB', 'onFID', 'onINP'].forEach(
            (hook) => {
              // eslint-disable-next-line no-undef
              webVitals[hook]((metric) => {
                console.trace(
                  JSON.stringify({
                    name: metric.name,
                    value: metric.value,
                    metric: metric,
                    url: window.location.href // eslint-disable-line  no-undef
                  })
                );
              });
            }
          );
        });

        const page = await context.newPage();

        debug('page created');

        page.on('response', (response) => {
          const status = response.status();
          events.emit(
            'counter',
            self.processor.$rewriteMetricName(
              'browser.page.codes.' + status,
              'counter'
            ),
            1
          );
        });

        page.on('domcontentloaded', async (page) => {
          if (!self.extendedMetrics) {
            return;
          }

          try {
            const performanceTimingJson = await page.evaluate(
              () => JSON.stringify(window.performance.timing) // eslint-disable-line  no-undef
            );
            const performanceTiming = JSON.parse(performanceTimingJson);

            if (
              uniquePageLoadToTiming[
                getName(page.url()) + performanceTiming.connectStart
              ]
            ) {
              return;
            } else {
              uniquePageLoadToTiming[
                getName(page.url()) + performanceTiming.connectStart
              ] = performanceTiming;
            }

            debug('domcontentloaded:', getName(page.url()));
            const startToInteractive =
              performanceTiming.domInteractive -
              performanceTiming.navigationStart;

            events.emit(
              'counter',
              self.processor.$rewriteMetricName(
                'browser.page.domcontentloaded',
                'counter'
              ),
              1
            );
            events.emit(
              'counter',
              self.processor.$rewriteMetricName(
                `browser.page.domcontentloaded.${getName(page.url())}`,
                'counter'
              ),
              1
            );
            events.emit(
              'histogram',
              self.processor.$rewriteMetricName(
                'browser.page.dominteractive',
                'histogram'
              ),
              startToInteractive
            );
            events.emit(
              'histogram',
              self.processor.$rewriteMetricName(
                `browser.page.dominteractive.${getName(page.url())}`,
                'histogram'
              ),
              startToInteractive,
              { url: page.url(), vuId: initialContext.vars.$uuid }
            );
          } catch (err) {}
        });

        page.on('console', async (msg) => {
          if (msg.type() === 'trace') {
            debug(msg);
            try {
              const metric = JSON.parse(msg.text());
              const { name, value, url } = metric;

              // We only want metrics for pages on our website, not iframes
              if (url.startsWith(self.target) || self.showAllPageMetrics) {
                events.emit(
                  'histogram',
                  self.processor.$rewriteMetricName(
                    `browser.page.${name}.${getName(url)}`,
                    'histogram'
                  ),
                  value,
                  {
                    rating: metric.metric.rating,
                    url,
                    vuId: initialContext.vars.$uuid
                  }
                );
              }
            } catch (err) {}
          }
        });

        page.on('load', async (page) => {
          if (!self.extendedMetrics) {
            return;
          }

          try {
            debug('load:', getName(page.url()));

            const { usedJSHeapSize } = JSON.parse(
              await page.evaluate(() =>
                JSON.stringify({
                  usedJSHeapSize: window.performance.memory.usedJSHeapSize // eslint-disable-line  no-undef
                })
              )
            );
            events.emit(
              'histogram',
              self.processor.$rewriteMetricName(
                'browser.memory_used_mb',
                'histogram'
              ),
              usedJSHeapSize / 1000 / 1000,
              { url: page.url(), vuId: initialContext.vars.$uuid }
            );
          } catch (err) {}
        });

        page.on('pageerror', (error) => {
          debug('pageerror:', getName(page.url()));
        });
        page.on('requestfinished', (request) => {
          // const timing = request.timing();
          events.emit(
            'counter',
            self.processor.$rewriteMetricName(
              'browser.http_requests',
              'counter'
            ),
            1
          );
        });
        page.on('response', (response) => {});

        const fn =
          self.processor[spec.testFunction] ||
          self.processor[spec.flowFunction] ||
          spec.testFunction;

        if (!fn) {
          console.error('Playwright test function not found:', fn);

          return cb(
            new Error('Playwright test function not found'),
            initialContext
          );
        }

        const test = { step };

        let traceScenario;
        if (self.tracing) {
          traceScenario = self.processor[spec.traceFlowFunction];
          await traceScenario(page, initialContext, events, fn, spec.name);
        } else {
          await fn(page, initialContext, events, test);
        }
        await page.close();

        if (cb) {
          cb(null, initialContext);
        }
        return initialContext;
      } catch (err) {
        function cleanErrorMessage(error) {
          // Remove ANSI color codes and use only first line of error message
          const cleanMsg = error.message
            .replace(/\u001b\[.*?m/g, '')
            .split('\n')[0];

          // If the error is not a Playwright failed assertion, return the clean error message
          if (!error.matcherResult) {
            return cleanMsg;
          }
          // If the error is a Playwright failed assertion, we return the expectation name (e.g. toHaveText)

          const expectation =
            // First we try to get the name from the `name` property of the matcherResult
            error.matcherResult.name ||
            // If the name property is not available, we try to extract it from the error message that usually contains the expect function called e.g. expect(locator).toHaveContent('text') or expect(locator).not.toHaveContent('text'))
            // The expectation name returned will not have the "not." prefix if the expectation is negated as Playwright also doesn't include it in the name.
            cleanMsg
              .match(/\).(not.)?to[a-zA-Z]+/)[0]
              ?.slice(2)
              .replace('not.', '');
          // If the expectation name is not available, we return the error message
          return expectation ? `pw_failed_assertion.${expectation}` : cleanMsg;
        }
        console.error(err);
        events.emit('error', cleanErrorMessage(err));

        if (initialContext.vars.isRecording) {
          if (
            Date.now() - self.lastTraceRecordedTime >
            self.TRACE_RECORDING_INTERVAL_MSEC
          ) {
            try {
              await context.tracing.stop({
                path: initialContext.vars.__tracePath
              });
            } catch (err) {
              debug(err);
            }
            events.emit('counter', 'browser.traces_collected', 1);
            self.lastTraceRecordedTime = Date.now();
            self.tracesRecordedCount++;
            initialContext.vars.isRecording = false; // for finally{} block
          }
        }

        if (cb) {
          cb(err, initialContext);
        } else {
          throw err;
        }
      } finally {
        if (initialContext.vars.isRecording) {
          self.vusRecording--;
          // This VU was recording but completed successfully, drop the recording
          // unless recordSuccessfulVUs is set
          if (self.tracingConfig.recordSuccessfulVUs) {
            await context.tracing.stop({
              path: initialContext.vars.__tracePath
            });
            events.emit('counter', 'browser.traces_collected', 1);
          } else {
            await context.tracing.stop();
            events.emit('counter', 'browser.traces_discarded', 1);
          }
        }

        await context.close();

        if (self.useSeparateBrowserPerVU) {
          await browser.close();
        }
      }
    };
  }
}

module.exports = PlaywrightEngine;
