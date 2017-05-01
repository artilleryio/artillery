module.exports = {
  config: {
    target: "http://unused.com",
    phases: [{
      duration: 1,
      arrivalRate: 1,
    }],
  },
  scenarios: [{
    flow: [{
      log: "js file works"
    }],
  }],
};
