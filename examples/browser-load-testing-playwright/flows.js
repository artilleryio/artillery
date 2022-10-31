//
// The code in this function was generated with
// playwright codegen
// https://playwright.dev/docs/cli/#generate-code
//
async function devAccountSignupFlow (page) {
  // Go to https://artillery.io/
  await page.goto('https://artillery.io/');
  // Click text=Pricing
  await page.click('text=Pricing');
  // assert.equal(page.url(), 'https://artillery.io/pro/');
  // Click text=Sign up
  await page.click('text=Sign up');
  // Click button:has-text("Start")
  // await page.frame({
  //   url: 'https://form.typeform.com/to/l2fWPad2?typeform-medium=embed-sdk&typeform-embed=popup-drawer&typeform-source=artillery.io&typeform-embed-id=feamc'
  // }).click('button:has-text("Start")');
  // ---------------------

  // await page.pause();
}

//
// A simple smoke test using a headless browser:
//
async function checkPage(page, userContext, events) {
  const url = userContext.vars.url;
  const response = await page.goto(url);
  if (response.status() !== 200) {
    events.emit('counter', `user.status_check_failed.${url}`, 1);
  } else {
    events.emit('counter', `user.status_check_ok.${url}`, 1);
  }
}

async function multistepWithCustomMetrics(page, userContext, events) {
  // Part 1 of our flow
  await page.goto('https://www.artillery.io');

  // Part 2 of our flow - we want to capture response times for this
  // part separately and report it as a custom metric:

  // First we record the current time:
  const startedTime = Date.now();
  // Our test then proceeds with the sequence of actions that we want to
  // report for specifically.
  //
  // NOTE: We only have one action here, but we could have a longer sequence of
  // actions here which would add up to the time we are tracking as
  // time_taken_for_part_of_flow metric.
  await page.goto('https://www.artillery.io/product');
  // We then calculate the amount of time previous actions took and use
  // Artillery's custom metrics API to record it. The metric will be available
  // in Artillery's report alongside other metrics.
  // For more information on custom metrics API please see:
  // https://www.artillery.io/docs/guides/guides/extension-apis#tracking-custom-metrics
  const difference = Date.now() - startedTime;
  events.emit('histogram', 'time_taken_for_part_of_flow', difference);

  // Part 3 of our flow:
  await page.goto('https://www.artillery.io/docs');
}

module.exports = {
  devAccountSignupFlow,
  checkPage,
  multistepWithCustomMetrics,
};
