/**
 * @jest-environment node
 */

/**
 * `GET`/`POST /api/cron/coupon-sweep`'s HTTP contract: the bearer check, and honest reporting of the
 * job's real result (including a zero release count) rather than a bare `success: true`.
 *
 * The job itself (`runCouponSweepJob`, and beneath it `releaseExpiredClaims`) is exercised by
 * `_lib/__tests__/coupon-sweep-job.test.ts` and `coupon-claims.test.ts`; this file only pins what
 * the route adds on top - auth, status codes, and the response envelope.
 */
jest.mock('../../_lib/coupon-sweep-job', () => ({
  runCouponSweepJob: jest.fn(),
}));

import { runCouponSweepJob } from '../../_lib/coupon-sweep-job';
import { GET, POST } from '../route';

type Mock = ReturnType<typeof jest.fn>;
const mockRun = runCouponSweepJob as unknown as Mock;

/**
 * Build a cron request.
 *
 * @param headers - Extra headers, e.g. `authorization`.
 * @param method - HTTP method. Defaults to `GET`.
 * @returns A request to the coupon-sweep endpoint.
 */
function cronRequest(headers: Record<string, string> = {}, method = 'GET'): Request {
  return new Request('http://localhost:3000/api/cron/coupon-sweep', { method, headers });
}

describe('GET/POST /api/cron/coupon-sweep', () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalLegacyToken = process.env.SYNC_AUTH_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    delete process.env.SYNC_AUTH_TOKEN;
  });

  afterAll(() => {
    process.env.CRON_SECRET = originalCronSecret;
    process.env.SYNC_AUTH_TOKEN = originalLegacyToken;
  });

  it('rejects a request with no bearer token before running the job', async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong token', async () => {
    const response = await GET(cronRequest({ authorization: 'Bearer wrong' }));

    expect(response.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('runs the sweep and reports the real released count for an authorized GET', async () => {
    mockRun.mockResolvedValue({
      windowDays: 30,
      releasedCount: 3,
      couponIds: ['coupon-1', 'coupon-1', 'coupon-2'],
      timestamp: '2026-08-27T08:30:00.000Z',
    });

    const response = await GET(cronRequest({ authorization: 'Bearer test-cron-secret' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.job).toBe('coupon-sweep');
    expect(body.summary.releasedCount).toBe(3);
  });

  it('honestly reports a zero-release run as success, not as nothing having happened', async () => {
    mockRun.mockResolvedValue({
      windowDays: 30,
      releasedCount: 0,
      couponIds: [],
      timestamp: '2026-08-27T08:30:00.000Z',
    });

    const response = await POST(cronRequest({ authorization: 'Bearer test-cron-secret' }, 'POST'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.summary.releasedCount).toBe(0);
  });

  it('returns 500 with the failure reason when the job throws, rather than a false success', async () => {
    mockRun.mockRejectedValue(new Error('connection terminated'));

    const response = await POST(cronRequest({ authorization: 'Bearer test-cron-secret' }, 'POST'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('connection terminated');
  });

  it('accepts the legacy SYNC_AUTH_TOKEN as well as CRON_SECRET', async () => {
    delete process.env.CRON_SECRET;
    process.env.SYNC_AUTH_TOKEN = 'legacy-token';
    mockRun.mockResolvedValue({ windowDays: 30, releasedCount: 0, couponIds: [], timestamp: 'now' });

    const response = await GET(cronRequest({ authorization: 'Bearer legacy-token' }));

    expect(response.status).toBe(200);
  });
});
