const { test } = require('node:test');
const assert = require('node:assert');
const {
  parseResourceTags,
  toTagMap,
  toEcsTags
} = require('../../lib/platform/aws/resource-tags.ts');

test('parseResourceTags - empty input returns empty array', (_t) => {
  assert.deepEqual(parseResourceTags(undefined), []);
  assert.deepEqual(parseResourceTags(''), []);
  assert.deepEqual(parseResourceTags(null), []);
});

test('parseResourceTags - parses key:value pairs', (_t) => {
  assert.deepEqual(parseResourceTags('team:perf'), [
    { key: 'team', value: 'perf' }
  ]);

  assert.deepEqual(parseResourceTags('team:perf,cost-center:1234'), [
    { key: 'team', value: 'perf' },
    { key: 'cost-center', value: '1234' }
  ]);
});

test('parseResourceTags - trims whitespace around entries, keys and values', (_t) => {
  assert.deepEqual(parseResourceTags(' team : perf , env : load '), [
    { key: 'team', value: 'perf' },
    { key: 'env', value: 'load' }
  ]);
});

test('parseResourceTags - ignores empty entries from stray commas', (_t) => {
  assert.deepEqual(parseResourceTags('team:perf,,env:load,'), [
    { key: 'team', value: 'perf' },
    { key: 'env', value: 'load' }
  ]);
});

test('parseResourceTags - splits on first colon only, values may contain colons', (_t) => {
  assert.deepEqual(parseResourceTags('env:load:test'), [
    { key: 'env', value: 'load:test' }
  ]);
});

test('parseResourceTags - allows empty value', (_t) => {
  assert.deepEqual(parseResourceTags('team:'), [{ key: 'team', value: '' }]);
});

test('parseResourceTags - allows AWS tag special characters', (_t) => {
  assert.deepEqual(parseResourceTags('a_b.c/d:x=y+z-w@v'), [
    { key: 'a_b.c/d', value: 'x=y+z-w@v' }
  ]);
});

test('parseResourceTags - rejects entry without separator', (_t) => {
  assert.throws(
    () => parseResourceTags('noseparator'),
    /expected key:value format/
  );
});

test('parseResourceTags - rejects empty key', (_t) => {
  assert.throws(() => parseResourceTags(':value'), /tag key is empty/);
});

test('parseResourceTags - rejects duplicate keys', (_t) => {
  assert.throws(() => parseResourceTags('dup:1,dup:2'), /duplicate tag key/);
});

test('parseResourceTags - rejects invalid characters', (_t) => {
  assert.throws(
    () => parseResourceTags('bad<key>:x'),
    /tag key contains invalid characters/
  );

  assert.throws(
    () => parseResourceTags('key:bad"value"'),
    /tag value contains invalid characters/
  );
});

test('parseResourceTags - rejects key longer than 128 characters', (_t) => {
  const longKey = 'k'.repeat(129);
  assert.throws(
    () => parseResourceTags(`${longKey}:v`),
    /tag key exceeds 128 characters/
  );

  // 128 exactly is fine:
  assert.equal(parseResourceTags(`${'k'.repeat(128)}:v`).length, 1);
});

test('parseResourceTags - rejects value longer than 256 characters', (_t) => {
  const longValue = 'v'.repeat(257);
  assert.throws(
    () => parseResourceTags(`k:${longValue}`),
    /tag value exceeds 256 characters/
  );

  // 256 exactly is fine:
  assert.equal(parseResourceTags(`k:${'v'.repeat(256)}`).length, 1);
});

test('parseResourceTags - rejects more than 50 tags', (_t) => {
  const fifty = Array.from({ length: 50 }, (_, i) => `k${i}:v`).join(',');
  assert.equal(parseResourceTags(fifty).length, 50);

  const fiftyOne = Array.from({ length: 51 }, (_, i) => `k${i}:v`).join(',');
  assert.throws(
    () => parseResourceTags(fiftyOne),
    /maximum of 50 tags is allowed/
  );
});

test('parseResourceTags - reports all errors at once', (_t) => {
  try {
    parseResourceTags('noseparator,:empty,dup:1,dup:2');
    assert.fail('expected to throw');
  } catch (err) {
    assert.match(err.message, /expected key:value format/);
    assert.match(err.message, /tag key is empty/);
    assert.match(err.message, /duplicate tag key/);
  }
});

test('toTagMap - converts to key/value map', (_t) => {
  assert.deepEqual(toTagMap(parseResourceTags('a:1,b:2')), { a: '1', b: '2' });
  assert.deepEqual(toTagMap([]), {});
});

test('toEcsTags - converts to ECS tag shape', (_t) => {
  assert.deepEqual(toEcsTags(parseResourceTags('a:1')), [
    { key: 'a', value: '1' }
  ]);
  assert.deepEqual(toEcsTags([]), []);
});
