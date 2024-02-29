import { expect, Page } from '@playwright/test';

export async function artilleryPlaywrightFunction(
  page: Page,
  vuContext,
  events,
  test
) {
  await test.step('go_to_artillery_io', async () => {
    await page.goto('/');
    await expect(page.getByText('The Artillery Manifesto')).toBeVisible();
  });

  await test.step('go_to_docs', async () => {
    await page
      .getByLabel('Main navigation')
      .getByRole('link', { name: 'Documentation' })
      .click();
    await expect(page).toHaveURL('/docs');
    await expect(
      page.getByText("What's different about Artillery?")
    ).toBeVisible();
  });
}

export async function playwrightFunctionWithFailure(
  page: Page,
  vuContext,
  events,
  test
) {
  // await test.step('go_to_artillery_repo', async () => {
  //   await page.goto(`${vuContext.vars.target}/`);
  //   await expect(page.getByText('gremlins are here!')).toBeVisible();
  // });

  await test.step('go_to_artillery_io', async () => {
    await page.goto('/');
    await expect(page.getByText('gremlins are here!')).toBeVisible();
  });
  events.emit('counter', 'custom_emitter', 1);
}
