import { goToDocsAndSearch } from '../helpers';
import { test } from '@playwright/test';

test('search and go to doc page', async ({ page }) => {
  await goToDocsAndSearch(page, test.step);
});
