const { expect } = require('@playwright/test');

//this is due to occasional failures in CI due to known unresolved issue: https://github.com/microsoft/playwright/issues/13062
const retryGoingToPage = async (page, url) => {
  let retryCount = 0;
  let error;
  while (retryCount < 5) {
    try {
      await page.goto(url);
      return;
    } catch (err) {
      console.log(`ERROR: page.goto in Playwright test - ${err.message}`);
      console.log('Retrying...');
      error = err;
      retryCount++;
    }
  }
  throw new Error(`Failed to go to page ${url}: ${error}`);
};

async function artilleryPlaywrightFunction(page, vuContext, events, test) {
  await test.step('go_to_artillery_io', async () => {
    await retryGoingToPage(page, '/');

    await expect(page.getByText('The Artillery Manifesto')).toBeVisible();
  });

  await test.step('go_to_docs', async () => {
    await page.getByRole('link', { name: 'Docs' }).click();
    await expect(page).toHaveURL('/docs');
    await expect(
      page.getByText('What’s different about Artillery?')
    ).toBeVisible();
  });

  events.emit('counter', 'custom_emitter', 1);
}

async function playwrightFunctionWithFailure(page, vuContext, events, test) {
  await test.step('go_to_artillery_io', async () => {
    await retryGoingToPage(page, '/');
    await expect(page.getByText('gremlins are here!')).toBeVisible();
  });
  events.emit('counter', 'custom_emitter', 1);
}

module.exports = {
  artilleryPlaywrightFunction,
  playwrightFunctionWithFailure
};
