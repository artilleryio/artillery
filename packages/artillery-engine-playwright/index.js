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
      (Number.isNaN(Number(this.config.defaultNavigationTimeout))
        ? 30
        : Number(this.config.defaultNavigationTimeout)) * 1000;
    this.defaultTimeout =
      (Number.isNaN(Number(this.config.defaultTimeout))
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
      this.processor.$rewriteMetricName = (name, _type) => name;
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
        const WEB_VITALS_SCRIPT =
          '!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).webVitals={})}(this,(function(e){"use strict";let t=-1;const n=e=>{addEventListener("pageshow",(n=>{n.persisted&&(t=n.timeStamp,e(n))}),!0)},i=(e,t,n,i)=>{let o,s;return r=>{t.value>=0&&(r||i)&&(s=t.value-(o??0),(s||void 0===o)&&(o=t.value,t.delta=s,t.rating=((e,t)=>e>t[1]?"poor":e>t[0]?"needs-improvement":"good")(t.value,n),e(t)))}},o=e=>{requestAnimationFrame((()=>requestAnimationFrame((()=>e()))))},s=()=>{const e=performance.getEntriesByType("navigation")[0];if(e&&e.responseStart>0&&e.responseStart<performance.now())return e},r=()=>{const e=s();return e?.activationStart??0},c=(e,n=-1)=>{const i=s();let o="navigate";t>=0?o="back-forward-cache":i&&(document.prerendering||r()>0?o="prerender":document.wasDiscarded?o="restore":i.type&&(o=i.type.replace(/_/g,"-")));return{name:e,value:n,rating:"good",delta:0,entries:[],id:`v5-$`+`{Date.now()}-$`+`{Math.floor(8999999999999*Math.random())+1e12}`,navigationType:o}},a=new WeakMap;function d(e,t){return a.get(e)||a.set(e,new t),a.get(e)}class f{t;i=0;o=[];h(e){if(e.hadRecentInput)return;const t=this.o[0],n=this.o.at(-1);this.i&&t&&n&&e.startTime-n.startTime<1e3&&e.startTime-t.startTime<5e3?(this.i+=e.value,this.o.push(e)):(this.i=e.value,this.o=[e]),this.t?.(e)}}const h=(e,t,n={})=>{try{if(PerformanceObserver.supportedEntryTypes.includes(e)){const i=new PerformanceObserver((e=>{Promise.resolve().then((()=>{t(e.getEntries())}))}));return i.observe({type:e,buffered:!0,...n}),i}}catch{}},u=e=>{let t=!1;return()=>{t||(e(),t=!0)}};let l=-1;const p=new Set,m=()=>"hidden"!==document.visibilityState||document.prerendering?1/0:0,g=e=>{if("hidden"===document.visibilityState){if("visibilitychange"===e.type)for(const e of p)e();isFinite(l)||(l="visibilitychange"===e.type?e.timeStamp:0,removeEventListener("prerenderingchange",g,!0))}},v=()=>{if(l<0){const e=r(),t=document.prerendering?void 0:globalThis.performance.getEntriesByType("visibility-state").filter((t=>"hidden"===t.name&&t.startTime>e))[0]?.startTime;l=t??m(),addEventListener("visibilitychange",g,!0),addEventListener("prerenderingchange",g,!0),n((()=>{setTimeout((()=>{l=m()}))}))}return{get firstHiddenTime(){return l},onHidden(e){p.add(e)}}},y=e=>{document.prerendering?addEventListener("prerenderingchange",(()=>e()),!0):e()},b=[1800,3e3],T=(e,t={})=>{y((()=>{const s=v();let a,d=c("FCP");const f=h("paint",(e=>{for(const t of e)"first-contentful-paint"===t.name&&(f.disconnect(),t.startTime<s.firstHiddenTime&&(d.value=Math.max(t.startTime-r(),0),d.entries.push(t),a(!0)))}));f&&(a=i(e,d,b,t.reportAllChanges),n((n=>{d=c("FCP"),a=i(e,d,b,t.reportAllChanges),o((()=>{d.value=performance.now()-n.timeStamp,a(!0)}))})))}))},E=[.1,.25];let L=0,P=1/0,_=0;const M=e=>{for(const t of e)t.interactionId&&(P=Math.min(P,t.interactionId),_=Math.max(_,t.interactionId),L=_?(_-P)/7+1:0)};let w;const C=()=>w?L:performance.interactionCount??0,I=()=>{"interactionCount"in performance||w||(w=h("event",M,{type:"event",buffered:!0,durationThreshold:0}))};let F=0;class k{u=[];l=new Map;p;m;v(){F=C(),this.u.length=0,this.l.clear()}T(){const e=Math.min(this.u.length-1,Math.floor((C()-F)/50));return this.u[e]}h(e){if(this.p?.(e),!e.interactionId&&"first-input"!==e.entryType)return;const t=this.u.at(-1);let n=this.l.get(e.interactionId);if(n||this.u.length<10||e.duration>t.L){if(n?e.duration>n.L?(n.entries=[e],n.L=e.duration):e.duration===n.L&&e.startTime===n.entries[0].startTime&&n.entries.push(e):(n={id:e.interactionId,entries:[e],L:e.duration},this.l.set(n.id,n),this.u.push(n)),this.u.sort(((e,t)=>t.L-e.L)),this.u.length>10){const e=this.u.splice(10);for(const t of e)this.l.delete(t.id)}this.m?.(n)}}}const x=e=>{const t=globalThis.requestIdleCallback||setTimeout;"hidden"===document.visibilityState?e():(e=u(e),addEventListener("visibilitychange",e,{once:!0,capture:!0}),t((()=>{e(),removeEventListener("visibilitychange",e,{capture:!0})})))},A=[200,500];class B{p;h(e){this.p?.(e)}}const S=[2500,4e3],N=[800,1800],q=e=>{document.prerendering?y((()=>q(e))):"complete"!==document.readyState?addEventListener("load",(()=>q(e)),!0):setTimeout(e)};e.CLSThresholds=E,e.FCPThresholds=b,e.INPThresholds=A,e.LCPThresholds=S,e.TTFBThresholds=N,e.onCLS=(e,t={})=>{const s=v();T(u((()=>{let r,a=c("CLS",0);const u=d(t,f),l=e=>{for(const t of e)u.h(t);u.i>a.value&&(a.value=u.i,a.entries=u.o,r())},p=h("layout-shift",l);p&&(r=i(e,a,E,t.reportAllChanges),s.onHidden((()=>{l(p.takeRecords()),r(!0)})),n((()=>{u.i=0,a=c("CLS",0),r=i(e,a,E,t.reportAllChanges),o((()=>r()))})),setTimeout(r))})))},e.onFCP=T,e.onINP=(e,t={})=>{if(!globalThis.PerformanceEventTiming||!("interactionId"in PerformanceEventTiming.prototype))return;const o=v();y((()=>{I();let s,r=c("INP");const a=d(t,k),f=e=>{x((()=>{for(const t of e)a.h(t);const t=a.T();t&&t.L!==r.value&&(r.value=t.L,r.entries=t.entries,s())}))},u=h("event",f,{durationThreshold:t.durationThreshold??40});s=i(e,r,A,t.reportAllChanges),u&&(u.observe({type:"first-input",buffered:!0}),o.onHidden((()=>{f(u.takeRecords()),s(!0)})),n((()=>{a.v(),r=c("INP"),s=i(e,r,A,t.reportAllChanges)})))}))},e.onLCP=(e,t={})=>{y((()=>{const s=v();let a,f=c("LCP");const l=d(t,B),p=e=>{t.reportAllChanges||(e=e.slice(-1));for(const t of e)l.h(t),t.startTime<s.firstHiddenTime&&(f.value=Math.max(t.startTime-r(),0),f.entries=[t],a())},m=h("largest-contentful-paint",p);if(m){a=i(e,f,S,t.reportAllChanges);const s=u((()=>{p(m.takeRecords()),m.disconnect(),a(!0)})),r=e=>{e.isTrusted&&(x(s),removeEventListener(e.type,r,{capture:!0}))};for(const e of["keydown","click","visibilitychange"])addEventListener(e,r,{capture:!0});n((n=>{f=c("LCP"),a=i(e,f,S,t.reportAllChanges),o((()=>{f.value=performance.now()-n.timeStamp,a(!0)}))}))}}))},e.onTTFB=(e,t={})=>{let o=c("TTFB"),a=i(e,o,N,t.reportAllChanges);q((()=>{const d=s();d&&(o.value=Math.max(d.responseStart-r(),0),o.entries=[d],a(!0),n((()=>{o=c("TTFB",0),a=i(e,o,N,t.reportAllChanges),a(!0)})))}))}}));';
        await context.addInitScript(WEB_VITALS_SCRIPT);
        await context.addInitScript(() => {
          ['onLCP', 'onFCP', 'onCLS', 'onTTFB', 'onINP'].forEach((hook) => {
            webVitals[hook]((metric) => {
              console.trace(
                JSON.stringify({
                  name: metric.name,
                  value: metric.value,
                  metric: metric,
                  url: window.location.href
                })
              );
            });
          });
        });

        const page = await context.newPage();

        debug('page created');

        page.on('response', (response) => {
          const status = response.status();
          events.emit(
            'counter',
            self.processor.$rewriteMetricName(
              `browser.page.codes.${status}`,
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
            const performanceTimingJson = await page.evaluate(() =>
              JSON.stringify(window.performance.timing)
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
          } catch (_err) {}
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
            } catch (_err) {}
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
                  usedJSHeapSize: window.performance.memory.usedJSHeapSize
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
          } catch (_err) {}
        });

        page.on('pageerror', (_error) => {
          debug('pageerror:', getName(page.url()));
        });
        page.on('requestfinished', (_request) => {
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
        page.on('response', (_response) => {});

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
            // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes intentionally used
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
