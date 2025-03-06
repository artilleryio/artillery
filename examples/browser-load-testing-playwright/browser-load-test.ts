import { checkOutArtilleryCoreConceptsFlow } from './flows.js';

export const config = {
  target: 'https://www.artillery.io',
  phases: [
    {
      arrivalRate: 1,
      duration: 10
    }
  ],
  engines: {
    playwright: {}
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
    testFunction: checkOutArtilleryCoreConceptsFlow
  }
];
