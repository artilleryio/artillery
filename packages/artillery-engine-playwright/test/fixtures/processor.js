const { expect } = require('@playwright/test');

async function artilleryPlaywrightFunction(page, vuContext, events, test) {
  await test.step('go_to_artillery_repo', async () => {
    await page.goto(`${vuContext.vars.target}/`);
    await expect(page.getByTestId('latest-commit')).toBeVisible();
  });
  events.emit('counter', 'custom_emitter', 1);
}

async function playwrightFunctionWithFailure(page, vuContext, events, test) {
  await test.step('go_to_artillery_repo', async () => {
    await page.goto(`${vuContext.vars.target}/`);
    await expect(page.getByText('gremlins are here!')).toBeVisible();
  });
  events.emit('counter', 'custom_emitter', 1);
}

module.exports = {
  artilleryPlaywrightFunction,
  playwrightFunctionWithFailure
};
