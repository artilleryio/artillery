import { validateTestScript } from './helpers';

it('validates a script with 1 phase and 1 http scenario', () => {
  const result = validateTestScript(`
config:
  target: http://localhost:3000
  phases:
    - duration: 10
      rampTo: 50
scenarios:
  - engine: http
    flow:
      - get:
          url: /resource
`);

  expect(result.isValid).toBe(true);
  expect(result.errors).toEqual([]);
});

it('validates a script without "config" set', () => {
  const result = validateTestScript(`
scenarios:
  - engine: http
    flow:
      - get:
          url: /resource
    `);

  expect(result.isValid).toBe(true);
  expect(result.errors).toEqual([]);
});

it('errors when the "scenarios" are missing', () => {
  const result = validateTestScript(`
config:
  target: http://localhost:3000
  phases:
    - duration: 10
      rampTo: 50
  `);

  expect(result.isValid).toBe(false);
  expect(result.errors).toEqual([
    expect.objectContaining({
      keyword: 'required',
      params: { missingProperty: 'scenarios' }
    })
  ]);
});
