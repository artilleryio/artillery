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
        // UMD module inlined from the NPM version of https://github.com/GoogleChrome/web-vitals (web-vitals.umd.js):
        const WEB_VITALS_SCRIPT = `!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).webVitals={})}(this,(function(e){"use strict";var t,n,i,r,a=function(e,t){return{name:e,value:void 0===t?-1:t,delta:0,entries:[],id:"v2-".concat(Date.now(),"-").concat(Math.floor(8999999999999*Math.random())+1e12)}},o=function(e,t){try{if(PerformanceObserver.supportedEntryTypes.includes(e)){if("first-input"===e&&!("PerformanceEventTiming"in self))return;var n=new PerformanceObserver((function(e){return e.getEntries().map(t)}));return n.observe({type:e,buffered:!0}),n}}catch(e){}},u=function(e,t){var n=function n(i){"pagehide"!==i.type&&"hidden"!==document.visibilityState||(e(i),t&&(removeEventListener("visibilitychange",n,!0),removeEventListener("pagehide",n,!0)))};addEventListener("visibilitychange",n,!0),addEventListener("pagehide",n,!0)},c=function(e){addEventListener("pageshow",(function(t){t.persisted&&e(t)}),!0)},f=function(e,t,n){var i;return function(r){t.value>=0&&(r||n)&&(t.delta=t.value-(i||0),(t.delta||void 0===i)&&(i=t.value,e(t)))}},s=-1,m=function(){return"hidden"===document.visibilityState?0:1/0},d=function(){u((function(e){var t=e.timeStamp;s=t}),!0)},p=function(){return s<0&&(s=m(),d(),c((function(){setTimeout((function(){s=m(),d()}),0)}))),{get firstHiddenTime(){return s}}},v=function(e,t){var n,i=p(),r=a("FCP"),u=function(e){"first-contentful-paint"===e.name&&(m&&m.disconnect(),e.startTime<i.firstHiddenTime&&(r.value=e.startTime,r.entries.push(e),n(!0)))},s=window.performance&&performance.getEntriesByName&&performance.getEntriesByName("first-contentful-paint")[0],m=s?null:o("paint",u);(s||m)&&(n=f(e,r,t),s&&u(s),c((function(i){r=a("FCP"),n=f(e,r,t),requestAnimationFrame((function(){requestAnimationFrame((function(){r.value=performance.now()-i.timeStamp,n(!0)}))}))})))},l=!1,g=-1,h={passive:!0,capture:!0},y=new Date,T=function(e,r){t||(t=r,n=e,i=new Date,L(removeEventListener),E())},E=function(){if(n>=0&&n<i-y){var e={entryType:"first-input",name:t.type,target:t.target,cancelable:t.cancelable,startTime:t.timeStamp,processingStart:t.timeStamp+n};r.forEach((function(t){t(e)})),r=[]}},w=function(e){if(e.cancelable){var t=(e.timeStamp>1e12?new Date:performance.now())-e.timeStamp;"pointerdown"==e.type?function(e,t){var n=function(){T(e,t),r()},i=function(){r()},r=function(){removeEventListener("pointerup",n,h),removeEventListener("pointercancel",i,h)};addEventListener("pointerup",n,h),addEventListener("pointercancel",i,h)}(t,e):T(t,e)}},L=function(e){["mousedown","keydown","touchstart","pointerdown"].forEach((function(t){return e(t,w,h)}))},S={};e.getCLS=function(e,t){l||(v((function(e){g=e.value})),l=!0);var n,i=function(t){g>-1&&e(t)},r=a("CLS",0),s=0,m=[],d=function(e){if(!e.hadRecentInput){var t=m[0],i=m[m.length-1];s&&e.startTime-i.startTime<1e3&&e.startTime-t.startTime<5e3?(s+=e.value,m.push(e)):(s=e.value,m=[e]),s>r.value&&(r.value=s,r.entries=m,n())}},p=o("layout-shift",d);p&&(n=f(i,r,t),u((function(){p.takeRecords().map(d),n(!0)})),c((function(){s=0,g=-1,r=a("CLS",0),n=f(i,r,t)})))},e.getFCP=v,e.getFID=function(e,i){var s,m=p(),d=a("FID"),v=function(e){e.startTime<m.firstHiddenTime&&(d.value=e.processingStart-e.startTime,d.entries.push(e),s(!0))},l=o("first-input",v);s=f(e,d,i),l&&u((function(){l.takeRecords().map(v),l.disconnect()}),!0),l&&c((function(){var o;d=a("FID"),s=f(e,d,i),r=[],n=-1,t=null,L(addEventListener),o=v,r.push(o),E()}))},e.getLCP=function(e,t){var n,i=p(),r=a("LCP"),s=function(e){var t=e.startTime;t<i.firstHiddenTime&&(r.value=t,r.entries.push(e)),n()},m=o("largest-contentful-paint",s);if(m){n=f(e,r,t);var d=function(){S[r.id]||(m.takeRecords().map(s),m.disconnect(),S[r.id]=!0,n(!0))};["keydown","click"].forEach((function(e){addEventListener(e,d,{once:!0,capture:!0})})),u(d,!0),c((function(i){r=a("LCP"),n=f(e,r,t),requestAnimationFrame((function(){requestAnimationFrame((function(){r.value=performance.now()-i.timeStamp,S[r.id]=!0,n(!0)}))}))}))}},e.getTTFB=function(e){var t,n=a("TTFB");t=function(){try{var t=performance.getEntriesByType("navigation")[0]||function(){var e=performance.timing,t={entryType:"navigation",startTime:0};for(var n in e)"navigationStart"!==n&&"toJSON"!==n&&(t[n]=Math.max(e[n]-e.navigationStart,0));return t}();if(n.value=n.delta=t.responseStart,n.value<0||n.value>performance.now())return;n.entries=[t],e(n)}catch(e){}},"complete"===document.readyState?setTimeout(t,0):addEventListener("pageshow",t)},Object.defineProperty(e,"__esModule",{value:!0})}));`
        await context.addInitScript(WEB_VITALS_SCRIPT);
        await context.addInitScript(() => {
          // https://github.com/GoogleChrome/web-vitals/issues/38
          window.addEventListener('DOMContentLoaded', () => {
            webVitals.getTTFB(metric => { console.trace(JSON.stringify({ name: metric.name, value: metric.value, metric: metric, url: window.location.href })) })
            webVitals.getFCP(metric => { console.trace(JSON.stringify({ name: metric.name, value: metric.value, metric: metric, url: window.location.href })) })
            webVitals.getLCP(metric => { console.trace(JSON.stringify({ name: metric.name, value: metric.value, metric: metric, url: window.location.href })) })
            webVitals.getCLS(metric => { console.trace(JSON.stringify({ name: metric.name, value: metric.value, metric: metric, url: window.location.href })) })
          })
        });

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

        page.on('console', async msg => {
          if (msg.type() === 'trace') {
            debug(msg);
            try {
              const metric = JSON.parse(msg.text());
              // TODO: expose via extended metrics: TTFB
              if (metric.name === 'FCP' || metric.name === 'LCP') {
                const { name, value, url } = metric;
                events.emit('histogram', `engine.browser.page.${name}.${url}`, value);
              }
            } catch (err) {}
          }
        });

        page.on('load', async (page) => {
          debug('load:', page.url());
        });
        page.on('pageerror', (error) => {
          debug('pageerror:', page.url());
        });
        page.on('requestfinished', (request) => {
          // const timing = request.timing();
          // events.emit('histogram', 'engine.browser.http_response_time',timing.responseEnd - timing.responseStart);
        });
        page.on('response', (response) => {
        });

        const fn = self.config.processor[spec.flowFunction];
        await fn(page);

        await page.close({ runBeforeUnload:true });
        await page.waitForTimeout(1000);

        if(cb) { cb(null, initialContext); }
        return initialContext;
      } catch(err) {
        console.error(err);
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
