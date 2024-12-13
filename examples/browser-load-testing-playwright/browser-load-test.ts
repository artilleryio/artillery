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

export const scenarios = [
  {
    engine: 'playwright',
    name: 'check_out_core_concepts_scenario',
    testFunction: checkOutArtilleryCoreConceptsFlow
  }
];
