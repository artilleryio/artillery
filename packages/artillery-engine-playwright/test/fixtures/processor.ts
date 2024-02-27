import { expect, Page } from '@playwright/test';

export async function artilleryPlaywrightFunction(
  page: Page,
  vuContext,
  events,
  test
) {
  await test.step('go_to_artillery_repo', async () => {
    await page.goto(`${vuContext.vars.target}/`);
    await expect(page.getByTestId('latest-commit')).toBeVisible();
  });
}

export async function playwrightFunctionWithFailure(
  page: Page,
  vuContext,
  events,
  test
) {
  await test.step('go_to_artillery_repo', async () => {
    await page.goto(`${vuContext.vars.target}/`);
    await expect(page.getByText('gremlins are here!')).toBeVisible();
  });
  events.emit('counter', 'custom_emitter', 1);
}
