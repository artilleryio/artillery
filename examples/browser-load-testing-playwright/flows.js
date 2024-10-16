//
// The code in this function was generated with
// playwright codegen
// https://playwright.dev/docs/codegen
//
async function checkOutArtilleryCoreConceptsFlow(
  page,
  userContext,
  events,
  test
) {
  await test.step('Go to Artillery', async () => {
    const requestPromise = page.waitForRequest('https://artillery.io/');
    await page.goto('https://artillery.io/');
    const req = await requestPromise;
  });
  await test.step('Go to docs', async () => {
    const docs = await page.getByRole('link', { name: 'Docs' });
    await docs.click();
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

//
// A simple smoke test using a headless browser:
//
async function checkPage(page, userContext, events) {
  // The pageChecks variable is created via the config.payload
  // section in the YML config file
  for (const { url, title } of userContext.vars.pageChecks) {
    const response = await page.goto(url);
    if (response.status() !== 200) {
      events.emit('counter', `user.status_check_failed.${url}`, 1);
    } else {
      events.emit('counter', `user.status_check_ok.${url}`, 1);
    }

    const isElementVisible = await page.getByText(title).isVisible();

    if (!isElementVisible) {
      events.emit('counter', `user.element_check_failed.${title}`, 1);
    }

    await page.reload();
  }
}

async function multistepWithCustomMetrics(page, userContext, events, test) {
  //1. we get the convenience step() helper from the test object.
  //More information: https://www.artillery.io/docs/reference/engines/playwright#teststep-argument
  const { step } = test;

  //2. We can now wrap parts of our Playwright script in step() calls
  await step('go_to_artillery_io', async () => {
    await page.goto('https://www.artillery.io');
  });

  await step('go_to_cloud_page', async () => {
    await page.goto('https://www.artillery.io/cloud');
  });

  await step('go_to_docs', async () => {
    await page.goto('https://www.artillery.io/docs');
  });

  // 3. latency metrics will be emitted automatically throughout the test for each step.
  // For more information on custom metrics, please see: https://www.artillery.io/docs/guides/guides/extension-apis#tracking-custom-metrics
}

module.exports = {
  checkOutArtilleryCoreConceptsFlow,
  checkPage,
  multistepWithCustomMetrics
};
