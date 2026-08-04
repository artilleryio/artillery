import assert from 'node:assert/strict';

const playwright = await import('playwright');
const playwrightTest = await import('@playwright/test');
const playwrightCore = await import('playwright-core');

assert.equal(typeof playwright.chromium.launch, 'function');
assert.equal(typeof playwrightTest.test, 'function');
assert.equal(typeof playwrightTest.expect, 'function');
assert.equal(typeof playwrightCore.chromium.launch, 'function');

console.log('Playwright libraries are importable from user code');
