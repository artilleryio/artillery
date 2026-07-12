const { test } = require('node:test');
const assert = require('node:assert');
const { OTelTraceBase } = require('../../lib/open-telemetry/tracing/base');

test('replaceSpanNameRegex', (t, done) => {
  const spanNames = [
    'Page: https://artillery.io/ahdufrgtcjdge',
    'https://artillery.io/874747924374937'
  ];
  const replacementArray = [
    {
      pattern: '[0-9]+',
      as: '$id'
    },
    {
      pattern: 'Page: https://artillery.io/[a-zA-Z]+',
      as: 'https://artillery.io/$id'
    }
  ];
  const otelTraceBase = new OTelTraceBase({}, {});

  spanNames.forEach((spanName) => {
    console.log(spanName);
    const result = otelTraceBase.replaceSpanNameRegex(
      spanName,
      replacementArray
    );
    assert.strictEqual(result, 'https://artillery.io/$id', 'Matches and replaces the regex pattern in span name correctly.');
  });
  done();
});
