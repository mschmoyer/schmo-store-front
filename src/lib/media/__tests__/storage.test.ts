/**
 * Storage configuration tests.
 *
 * The load-bearing behaviour is degradation: with no object store configured,
 * `getStorage` returns null and `storageStatus` reports it, so the routes render
 * a labelled "not configured" state instead of crashing. This is the same
 * graceful-degradation contract the rest of the platform's integrations follow.
 */

describe('storage configuration', () => {
  const original = process.env.BLOB_READ_WRITE_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = original;
    jest.resetModules();
  });

  it('returns no adapter and an unconfigured status when the token is absent', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    jest.resetModules();
    const { getStorage, storageStatus } = await import('../storage');
    expect(getStorage()).toBeNull();
    expect(storageStatus()).toEqual({ configured: false, driver: null });
  });

  it('returns the blob adapter and a configured status when the token is set', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test_token';
    jest.resetModules();
    const { getStorage, storageStatus } = await import('../storage');
    expect(getStorage()).not.toBeNull();
    expect(storageStatus()).toEqual({ configured: true, driver: 'vercel-blob' });
  });
});
