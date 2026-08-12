/**
 * Ambient declarations for the Jest globals injected by the test runner.
 *
 * The project runs Jest 30 but does not depend on `@types/jest`, so `describe`,
 * `it`, `expect` and `jest` are untyped in test files. Rather than adding a new
 * dependency, the runtime globals are typed here by reusing the official types
 * that ship with `@jest/globals`.
 *
 * These are declared as globals rather than imported directly in each test
 * because importing `jest` from `@jest/globals` prevents babel-plugin-jest-hoist
 * from lifting `jest.mock(...)` calls above the module imports they need to
 * intercept.
 */
// `jest.setup.js` loads `@testing-library/jest-dom`, whose DOM matchers are
// registered on the `@jest/expect` interface by this entry point.
import type {} from '@testing-library/jest-dom/jest-globals';

import type {
  afterAll as afterAllFn,
  afterEach as afterEachFn,
  beforeAll as beforeAllFn,
  beforeEach as beforeEachFn,
  describe as describeFn,
  expect as expectFn,
  it as itFn,
  jest as jestObject,
  test as testFn,
  xdescribe as xdescribeFn,
  xit as xitFn,
  xtest as xtestFn,
  fdescribe as fdescribeFn,
  fit as fitFn,
} from '@jest/globals';

declare global {
  const afterAll: typeof afterAllFn;
  const afterEach: typeof afterEachFn;
  const beforeAll: typeof beforeAllFn;
  const beforeEach: typeof beforeEachFn;
  const describe: typeof describeFn;
  const expect: typeof expectFn;
  const it: typeof itFn;
  const jest: typeof jestObject;
  const test: typeof testFn;
  const xdescribe: typeof xdescribeFn;
  const xit: typeof xitFn;
  const xtest: typeof xtestFn;
  const fdescribe: typeof fdescribeFn;
  const fit: typeof fitFn;
}

export {};
