async function simpleCheck(page, userContext, events, test) {
  await test.step('Go to Artillery', async () => {
    const requestPromise = page.waitForRequest('https://artillery.io/');
    await page.goto('https://artillery.io/');
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

    await page.waitForURL('https://www.artillery.io/cloud?tf=1');
  });
}

module.exports = {
  simpleCheck
};
