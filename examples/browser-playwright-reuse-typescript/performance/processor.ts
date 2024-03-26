import { goToDocsAndSearch } from '../e2e/helpers';

export async function playwrightTest(page, vuContext, events, test) {
  const { step } = test;

  await goToDocsAndSearch(page, step);
}
