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

module.exports = {
  devAccountSignupFlow,
  checkPage,
};
