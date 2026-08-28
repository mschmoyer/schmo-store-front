import {
  PLATFORM_DISCOUNT_GRACE_DAYS,
  PLATFORM_DISCOUNT_WARNING_DAYS,
  resolveDiscountNotice,
  type DiscountNotice,
} from '../discount-notice';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-08-27T00:00:00Z');

function endsInDays(days: number): Date {
  return new Date(now.getTime() + days * DAY);
}

function endedDaysAgo(days: number): Date {
  return new Date(now.getTime() - days * DAY);
}

describe('constants', () => {
  it('grace is 14 days and the warning threshold is 30, per §5.2/§5.1', () => {
    expect(PLATFORM_DISCOUNT_GRACE_DAYS).toBe(14);
    expect(PLATFORM_DISCOUNT_WARNING_DAYS).toBe(30);
  });
});

describe('non-redeemed statuses never produce a notice', () => {
  it('is silent for an attributed (not yet subscribed) claim, even with a near discountEndsAt', () => {
    expect(resolveDiscountNotice(endsInDays(1), true, now, 'attributed')).toEqual({
      state: 'nothing-to-say',
    });
  });

  it('is silent for a released claim', () => {
    expect(resolveDiscountNotice(endsInDays(1), false, now, 'released')).toEqual({
      state: 'nothing-to-say',
    });
  });
});

describe('a coupon with no end date (free forever)', () => {
  it('never has anything to say', () => {
    expect(resolveDiscountNotice(null, true, now, 'redeemed')).toEqual({ state: 'nothing-to-say' });
    expect(resolveDiscountNotice(null, false, now, 'redeemed')).toEqual({
      state: 'nothing-to-say',
    });
  });
});

describe('the quiet period: more than 30 days remaining', () => {
  it('is silent at 31 days remaining, with a card', () => {
    expect(resolveDiscountNotice(endsInDays(31), true, now, 'redeemed')).toEqual({
      state: 'nothing-to-say',
    });
  });

  it('is silent at 31 days remaining, without a card', () => {
    expect(resolveDiscountNotice(endsInDays(31), false, now, 'redeemed')).toEqual({
      state: 'nothing-to-say',
    });
  });

  it('is silent well before the window (e.g. 300 days out)', () => {
    expect(resolveDiscountNotice(endsInDays(300), false, now, 'redeemed')).toEqual({
      state: 'nothing-to-say',
    });
  });
});

describe('the 30-day boundary: card on file is informational', () => {
  it('warns at exactly 30 days remaining', () => {
    const discountEndsAt = endsInDays(30);
    const notice = resolveDiscountNotice(discountEndsAt, true, now, 'redeemed');
    expect(notice).toEqual({
      state: 'informational',
      discountEndsAt,
      daysRemaining: 30,
      dismissible: true,
    });
  });

  it('stays informational as the date gets closer', () => {
    const discountEndsAt = endsInDays(1);
    expect(resolveDiscountNotice(discountEndsAt, true, now, 'redeemed')).toEqual({
      state: 'informational',
      discountEndsAt,
      daysRemaining: 1,
      dismissible: true,
    });
  });
});

describe('the 30-day boundary: no card on file is actionable', () => {
  it('is actionable (not dismissible) at exactly 30 days remaining', () => {
    const discountEndsAt = endsInDays(30);
    const notice = resolveDiscountNotice(discountEndsAt, false, now, 'redeemed');
    expect(notice).toEqual({
      state: 'actionable',
      discountEndsAt,
      daysRemaining: 30,
      dismissible: false,
    });
  });

  it('is actionable the day the window closes (0 days remaining, still in the future)', () => {
    const discountEndsAt = new Date(now.getTime() + 1); // 1ms in the future
    const notice = resolveDiscountNotice(discountEndsAt, false, now, 'redeemed') as Extract<
      DiscountNotice,
      { state: 'actionable' }
    >;
    expect(notice.state).toBe('actionable');
    expect(notice.daysRemaining).toBe(1); // rounds up, never reports 0 while still open
  });
});

describe('window closed, card on file: dunning is the grace, so silence', () => {
  it('says nothing the instant the window closes', () => {
    expect(resolveDiscountNotice(now, true, now, 'redeemed')).toEqual({ state: 'nothing-to-say' });
  });

  it('says nothing long after the window closed', () => {
    expect(resolveDiscountNotice(endedDaysAgo(400), true, now, 'redeemed')).toEqual({
      state: 'nothing-to-say',
    });
  });
});

describe('window closed, no card: grace applies', () => {
  it('is in-grace the instant the window closes', () => {
    const notice = resolveDiscountNotice(now, false, now, 'redeemed');
    expect(notice.state).toBe('in-grace');
  });

  it('is in-grace one day after closing', () => {
    const discountEndsAt = endedDaysAgo(1);
    const notice = resolveDiscountNotice(discountEndsAt, false, now, 'redeemed') as Extract<
      DiscountNotice,
      { state: 'in-grace' }
    >;
    expect(notice.state).toBe('in-grace');
    expect(notice.graceEndsAt.getTime()).toBe(
      discountEndsAt.getTime() + PLATFORM_DISCOUNT_GRACE_DAYS * DAY
    );
  });

  it('is still in-grace one millisecond before the grace deadline', () => {
    const discountEndsAt = new Date(
      now.getTime() - PLATFORM_DISCOUNT_GRACE_DAYS * DAY + 1
    );
    expect(resolveDiscountNotice(discountEndsAt, false, now, 'redeemed').state).toBe('in-grace');
  });

  it('is grace-exhausted at the exact grace deadline instant (inclusive boundary)', () => {
    const discountEndsAt = endedDaysAgo(PLATFORM_DISCOUNT_GRACE_DAYS);
    const notice = resolveDiscountNotice(discountEndsAt, false, now, 'redeemed');
    expect(notice.state).toBe('grace-exhausted');
  });

  it('is grace-exhausted well past the grace deadline', () => {
    const discountEndsAt = endedDaysAgo(PLATFORM_DISCOUNT_GRACE_DAYS + 100);
    const notice = resolveDiscountNotice(discountEndsAt, false, now, 'redeemed') as Extract<
      DiscountNotice,
      { state: 'grace-exhausted' }
    >;
    expect(notice.state).toBe('grace-exhausted');
    expect(notice.dismissible).toBe(false);
    expect(notice.graceEndsAt.getTime()).toBe(
      discountEndsAt.getTime() + PLATFORM_DISCOUNT_GRACE_DAYS * DAY
    );
  });
});

describe('grace never applies with a card on file, regardless of how long ago the window closed', () => {
  it.each([0, 1, PLATFORM_DISCOUNT_GRACE_DAYS, PLATFORM_DISCOUNT_GRACE_DAYS + 50])(
    '%i days after closing, with a card, is nothing-to-say',
    (daysAgo) => {
      expect(resolveDiscountNotice(endedDaysAgo(daysAgo), true, now, 'redeemed')).toEqual({
        state: 'nothing-to-say',
      });
    }
  );
});
