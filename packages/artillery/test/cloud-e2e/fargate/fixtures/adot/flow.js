async function simpleCheck(page, userContext, events, test) {
  await test.step('Go to Artillery', async () => {
    const requestPromise = page.waitForRequest('https://artillery.io/');
    await page.goto('https://artillery.io/');
    const req = await requestPromise;
  });
  await test.step('Go to docs', async () => {
    await page.getByRole('link', { name: 'Docs' }).first().click();
    await page.waitForURL('https://www.artillery.io/docs');
  });

  await test.step('Go to core concepts', async () => {
    await page
      .getByRole('link', {
        name: 'Review core concepts'
      })
      .click();

    await page.waitForURL(
      'https://www.artillery.io/docs/get-started/core-concepts'
    );
  });
}

module.exports = {
  simpleCheck
};
