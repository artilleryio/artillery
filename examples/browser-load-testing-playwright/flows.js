//
// The code in this function was generated with
// playwright codegen
// https://playwright.dev/docs/codegen
//
async function cloudWaitlistSignupFlow(page) {
  await page.goto('https://www.artillery.io/');
  await page
    .getByLabel('Main navigation')
    .getByRole('link', { name: 'Cloud' })
    .click();
  await page
    .getByRole('button', { name: 'Join Artillery Cloud early access waitlist' })
    .click();
}

//
// A simple smoke test using a headless browser:
//
async function checkPage(page, userContext, events) {
  const url = userContext.vars.url;
  const title = userContext.vars.title;
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
  await page.goto('https://www.artillery.io/cloud');
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
  cloudWaitlistSignupFlow,
  checkPage,
  multistepWithCustomMetrics
};
