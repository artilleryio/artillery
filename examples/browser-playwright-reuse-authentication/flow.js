const { expect } = require('@playwright/test');
const fs = require('node:fs');

async function loginUserAndSaveStorage(page, context) {
  // NOTE: we use the $dirname utility so Playwright can resolve the full path
  const storageState = JSON.parse(
    fs.readFileSync(`${context.vars.$dirname}/storage.json`, 'utf8')
  );
  if (Object.keys(storageState).length > 0) {
    console.log('Already logged in. Skipping login.');
    return;
  }

  //1. navigate to page and assert that we are not logged in
  await page.goto(context.vars.target);
  await expect(page.getByText('Authentication example')).toBeVisible();

  //2. click login button and make sure we are redirected to `/login`
  await page.getByRole('link', { name: 'Login' }).click();
  await page.waitForURL('**/login');

  //3. fill in your github username and click login button
  await page.getByLabel('username').fill(context.vars.githubUsername);
  await page.getByRole('button', { name: 'Login' }).click();

  //4. ensure we are redirected to profile page and logged in
  await page.waitForURL('**/profile-sg');
  await expect(page.getByText('Your GitHub profile')).toBeVisible();

  //5. save iron session cookie to storage.json
  // NOTE: we use the $dirname utility so Playwright can resolve the full path
  await page
    .context()
    .storageState({ path: `${context.vars.$dirname}/storage.json` });
}

async function goToProfilePageAndLogout(page, context, _events, test) {
  const { step } = test;
  const profileHeaderText = 'Profile (Static Generation, recommended)';

  await step('go_to_page', async () => {
    await page.goto(context.vars.target);
    await expect(page.getByText(profileHeaderText)).toBeVisible();
  });

  await step('go_to_profile_page', async () => {
    await page.getByRole('link', { name: profileHeaderText }).click();
    await page.waitForURL('**/profile-sg');
    await expect(page.getByText('Your Github Profile')).toBeVisible();
  });

  await step('logout', async () => {
    await page.getByRole('link', { name: 'Logout' }).click();
    await page.waitForURL('**/login');
  });
}

module.exports = {
  loginUserAndSaveStorage,
  goToProfilePageAndLogout
};
