/**
 * Minimal typed surface for the stubbed `db.query` used by the billing tests.
 *
 * `@types/jest` is not a dependency of this repo, so the ambient `jest.MockedFunction` type is not
 * available. This interface describes only the mock methods the tests actually call, which keeps
 * the tests strictly typed without `any`.
 */
export interface QueryMock {
  (text: string, params?: unknown[]): unknown;
  mockReset(): void;
  mockResolvedValue(value: unknown): QueryMock;
  mockResolvedValueOnce(value: unknown): QueryMock;
  mockRejectedValueOnce(reason: unknown): QueryMock;
  mock: { calls: Array<[string, unknown[]]> };
}

/**
 * Cast the stubbed `db.query` to its mock surface.
 *
 * @param query - The stubbed function from the mocked connection module.
 * @returns The same function, typed as a {@link QueryMock}.
 */
export function asQueryMock(query: unknown): QueryMock {
  return query as QueryMock;
}
