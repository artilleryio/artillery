import { Page, expect } from '@playwright/test';

export const goToDocsAndSearch = async (page: Page, step) => {
  await step('go_to_artillery_io', async () => {
    await page.goto('/');
  });

  await step('go_to_docs', async () => {
    await page.getByRole('link', { name: 'Docs' }).click();
    await expect(page).toHaveURL('/docs');
    await expect(
      page.getByText("What's different about Artillery?")
    ).toBeVisible();
  });

  await step('search_for_ts_doc_and_goto', async () => {
    await page
      .getByRole('searchbox', { name: 'Search documentation…' })
      .click();
    await page.keyboard.type('typescript', { delay: 100 });
    await page
      .getByRole('link', { name: 'processor - load custom code' })
      .click();
    await expect(page.getByText('processor - load custom code')).toBeVisible();
  });
};
