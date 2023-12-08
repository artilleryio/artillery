async function cloudWaitlistSignupFlow(page, userContext, events, test) {
  await test.step('Go to Artillery', async () => {
    const requestPromise = page.waitForRequest('https://www.artillery.io/');
    await page.goto('https://www.artillery.io/');
    const req = await requestPromise;
  });

  await test.step('Go to cloud', async () => {
    const cloud = await page
      .getByLabel('Main navigation')
      .getByRole('link', { name: 'Cloud' });
    await cloud.click();
    await page.waitForURL('https://www.artillery.io/cloud');
  });

  await test.step('Click on Join button', async () => {
    await page
      .getByRole('button', {
        name: 'Join Artillery Cloud early access waitlist'
      })
      .click();

    await page.waitForURL('https://www.artillery.io/cloud?tf=1'); // Will cause Timeout error - wrong url
  });
}

module.exports = {
  cloudWaitlistSignupFlow
};
