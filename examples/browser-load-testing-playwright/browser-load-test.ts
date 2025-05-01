export const config = {
  target: 'https://www.artillery.io',
  phases: [
    {
      arrivalRate: 1,
      duration: 10
    }
  ],
  engines: {
    playwright: {
      trace: true
    }
  }
};

export const before = {
  engine: 'playwright',
  testFunction: async function beforeFunctionHook(_page, userContext, _events) {
    // Any scenario variables we add via userContext.vars in this before hook will be available in every VU
    userContext.vars.testStartTime = new Date();
  }
};

export const scenarios = [
  {
    engine: 'playwright',
    name: 'check_out_core_concepts_scenario',
    testFunction: async function checkOutArtilleryCoreConceptsFlow(
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
  }
];
