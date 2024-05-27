'use strict';

const { attachScenarioHooks } = require('../../util');
const { OTelTraceBase } = require('./base');

const { SemanticAttributes } = require('@opentelemetry/semantic-conventions');
const {
  SpanKind,
  SpanStatusCode,
  trace,
  context
} = require('@opentelemetry/api');

class OTelPlaywrightTraceReporter extends OTelTraceBase {
  constructor(config, script) {
    super(config, script);
  }
  run() {
    this.setTracer('playwright');
    attachScenarioHooks(this.script, [
      {
        engine: 'playwright',
        type: 'traceFlowFunction',
        name: 'runOtelTracingForPlaywright',
        hook: this.runOtelTracingForPlaywright.bind(this)
      }
    ]);
  }

  async runOtelTracingForPlaywright(
    page,
    vuContext,
    events,
    userFlowFunction,
    specName
  ) {
    if (this.config.replaceSpanNameRegex) {
      specName = this.replaceSpanNameRegex(
        specName,
        this.config.replaceSpanNameRegex
      );
    }
    // Start scenarioSpan as a root span for the trace and set it as active context
    return await this.playwrightTracer.startActiveSpan(
      specName || 'Scenario execution',
      { kind: SpanKind.CLIENT },
      async (scenarioSpan) => {
        if (!scenarioSpan.isRecording()) {
          scenarioSpan.end();
          return;
        }
        scenarioSpan.setAttributes({
          'vu.uuid': vuContext.vars.$uuid,
          test_id: vuContext.vars.$testId,
          ...(this.config.attributes || {})
        });
        this.pendingPlaywrightScenarioSpans++;
        // Set variables to track state and context
        const ctx = context.active();
        let lastPageUrl;
        let pageUrl;
        let pageSpan;

        // Listen to histograms to capture web vitals and other metrics set by Playwright engine, set them as attributes and if they are web vitals, as events too
        events.on('histogram', (name, value, metadata) => {
          // vuId from event must match current vuId
          if (!metadata || metadata.vuId !== vuContext.vars.$uuid) {
            return;
          }

          // Only look for page metrics or memory_used_mb metric. step metrics are handled separately in the step helper itself
          if (
            !name.startsWith('browser.page') &&
            name !== 'browser.memory_used_mb'
          ) {
            return;
          }

          // Associate only the metrics that belong to the page
          if (metadata.url !== pageSpan.attributes.url) {
            return;
          }
          const webVitals = ['LCP', 'FCP', 'CLS', 'TTFB', 'INP', 'FID'];

          try {
            const attrs = {};
            const metricName =
              name === 'browser.memory_used_mb' ? name : name.split('.')[2];

            if (webVitals.includes(metricName)) {
              attrs[`web_vitals.${metricName}.value`] = value;
              attrs[`web_vitals.${metricName}.rating`] = metadata.rating;
              pageSpan.addEvent(metricName, attrs);
            } else {
              attrs[metricName] = value;
            }
            pageSpan.setAttributes(attrs);
          } catch (err) {
            throw new Error(err);
          }
        });

        // Upon navigation to main frame, if the URL is different than existing page span, the existing page span is closed and new opened with new URL
        page.on('framenavigated', (frame) => {
          //only interested in mainframe navigations (not iframes, etc)
          if (frame !== page.mainFrame()) {
            return;
          }

          pageUrl = page.url();

          //only create a new span if the currently navigated page is different.
          //this is because we can have multiple framenavigated for the same url, but we're only interested in navigation changes
          if (pageUrl !== lastPageUrl) {
            scenarioSpan.addEvent(`navigated to ${page.url()}`);
            if (pageSpan) {
              pageSpan.end();
              this.pendingPlaywrightSpans--;
              events.emit(
                'counter',
                'plugins.publish-metrics.spans.exported',
                1
              );
            }
            let spanName = 'Page: ' + pageUrl;
            if (this.config.replaceSpanNameRegex) {
              spanName = this.replaceSpanNameRegex(
                spanName,
                this.config.replaceSpanNameRegex
              );
            }
            pageSpan = this.playwrightTracer.startSpan(
              spanName,
              { kind: SpanKind.CLIENT },
              ctx
            );
            pageSpan.setAttributes({
              'vu.uuid': vuContext.vars.$uuid,
              test_id: vuContext.vars.$testId,
              url: pageUrl,
              ...(this.config.attributes || {})
            });
            lastPageUrl = pageUrl;
            this.pendingPlaywrightSpans++;
          }
        });

        try {
          // Set the tracing 'this.step' function to the 'test' object which is exposed to the user
          const test = {
            step: (
              await this.step(
                scenarioSpan,
                this.playwrightTracer,
                events,
                vuContext
              )
            ).bind(this)
          };
          // Execute the user-provided processor function within the context of the new span
          await userFlowFunction(page, vuContext, events, test);
        } catch (err) {
          // We record the error on scenario span only if it has not been recorded in step spans. This is to avoid duplicate error recording
          if (!err.message.startsWith('Error during step execution:')) {
            scenarioSpan.recordException(err, Date.now());
            scenarioSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message
            });
          }
          // Removing the prefix added to error message in step spans so we can throw the original error
          const originalErrMsg = err.message.replace(
            'Error during step execution:',
            ''
          );
          err.message = originalErrMsg;
          throw err;
        } finally {
          if (pageSpan && !pageSpan.endTime[0]) {
            pageSpan.end();
            this.pendingPlaywrightSpans--;
            events.emit('counter', 'plugins.publish-metrics.spans.exported', 1);
          }
          scenarioSpan.end();
          this.pendingPlaywrightScenarioSpans--;
          events.emit('counter', 'plugins.publish-metrics.spans.exported', 1);
        }
      }
    );
  }

  async step(parent, tracer, events, vuContext) {
    return async function (stepName, callback) {
      // Set the parent context to be scenarioSpan and within it we create step spans
      return context.with(trace.setSpan(context.active(), parent), async () => {
        if (this.config.replaceSpanNameRegex) {
          stepName = this.replaceSpanNameRegex(
            stepName,
            this.config.replaceSpanNameRegex
          );
        }
        const span = tracer.startSpan(
          stepName,
          { kind: SpanKind.CLIENT },
          context.active()
        );
        this.pendingPlaywrightSpans++;
        const startTime = Date.now();

        try {
          span.setAttributes({
            'vu.uuid': vuContext.vars.$uuid,
            test_id: vuContext.vars.$testId,
            ...(this.config.attributes || {})
          });

          await callback();
        } catch (err) {
          span.recordException(err, Date.now());
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message
          });
          this.debug('There has been an error during step execution:');
          // Adding a prefix to the error message so we can screen out errors added to step spans from the ones we need to add to scenario span
          err.message = `Error during step execution: ${err.message}`;
          throw err;
        } finally {
          const difference = Date.now() - startTime;
          events.emit('histogram', `browser.step.${stepName}`, difference);
          span.end();
          this.pendingPlaywrightSpans--;
          events.emit('counter', 'plugins.publish-metrics.spans.exported', 1);
        }
      });
    };
  }
}

module.exports = {
  OTelPlaywrightTraceReporter
};
