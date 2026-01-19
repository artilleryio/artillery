import { checkPage } from './flows';
export const config = {
  target: 'https://www.artillery.io',
  phases: [
    {
      arrivalCount: 1,
      duration: 1
    }
  ],
  payload: {
    path: './pages.csv',
    fields: ['url', 'title'],
    loadAll: true,
    name: 'pageChecks'
  },
  engines: {
    playwright: {}
  }
};

export const scenarios = [
  {
    name: 'smoke_test_page',
    engine: 'playwright',
    testFunction: checkPage
  }
];
