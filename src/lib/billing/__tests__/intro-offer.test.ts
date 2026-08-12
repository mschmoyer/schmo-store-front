import {
  PLATFORM_INTRO_AMOUNT_CENTS,
  PLATFORM_INTRO_MONTHS,
  PLATFORM_LIST_AMOUNT_CENTS,
  buildIntroInvoiceSchedule,
  computeFirstChargeAmount,
  computeIntroCouponAmountOff,
  computeIntroEndDate,
  computeIntroWindowTotal,
  describeIntroOffer,
  formatCents,
} from '../intro-offer';

describe('platform intro offer: $1 for 3 months, then $19.99/month', () => {
  it('defines the offer in whole cents', () => {
    expect(PLATFORM_LIST_AMOUNT_CENTS).toBe(1999);
    expect(PLATFORM_INTRO_AMOUNT_CENTS).toBe(100);
    expect(PLATFORM_INTRO_MONTHS).toBe(3);
  });

  it('derives a coupon amount_off of $18.99', () => {
    expect(computeIntroCouponAmountOff()).toBe(1899);
    expect(PLATFORM_LIST_AMOUNT_CENTS - computeIntroCouponAmountOff()).toBe(100);
  });

  it('charges exactly $1.00 on each of the first three invoices', () => {
    const schedule = buildIntroInvoiceSchedule(3);

    expect(schedule).toHaveLength(3);
    schedule.forEach((invoice) => {
      expect(invoice.isIntro).toBe(true);
      expect(invoice.discountAmount).toBe(1899);
      expect(invoice.amountDue).toBe(100);
      expect(formatCents(invoice.amountDue)).toBe('$1.00');
    });
  });

  it('charges the full $19.99 from the fourth invoice onwards', () => {
    const schedule = buildIntroInvoiceSchedule(6);

    expect(schedule.slice(3).map((invoice) => invoice.amountDue)).toEqual([1999, 1999, 1999]);
    expect(schedule.slice(3).every((invoice) => invoice.discountAmount === 0)).toBe(true);
    expect(formatCents(schedule[3].amountDue)).toBe('$19.99');
  });

  it('charges $1.00 at checkout and $3.00 across the intro window', () => {
    expect(computeFirstChargeAmount()).toBe(100);
    expect(computeIntroWindowTotal()).toBe(300);
    expect(formatCents(computeIntroWindowTotal())).toBe('$3.00');
  });

  it('never loses a cent to floating point across a year of billing', () => {
    const twelveMonths = buildIntroInvoiceSchedule(12);
    const total = twelveMonths.reduce((sum, invoice) => sum + invoice.amountDue, 0);

    // 3 x $1.00 + 9 x $19.99 = $3.00 + $179.91 = $182.91
    expect(total).toBe(300 + 9 * 1999);
    expect(formatCents(total)).toBe('$182.91');
    expect(Number.isInteger(total)).toBe(true);
  });

  it('ends the intro window three months after the start date', () => {
    const start = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(computeIntroEndDate(start).toISOString()).toBe('2026-04-15T12:00:00.000Z');
  });

  it('rejects an offer whose intro price exceeds the list price', () => {
    expect(() =>
      computeIntroCouponAmountOff({
        listAmountCents: 100,
        introAmountCents: 1999,
        introMonths: 3,
      })
    ).toThrow(/cannot exceed/i);
  });

  it('rejects non-integer money', () => {
    expect(() =>
      computeIntroCouponAmountOff({
        listAmountCents: 19.99,
        introAmountCents: 1,
        introMonths: 3,
      })
    ).toThrow(/integer cents/i);
  });

  it('describes the offer without the UI doing arithmetic', () => {
    const summary = describeIntroOffer();

    expect(summary.introPrice).toBe('$1.00');
    expect(summary.listPrice).toBe('$19.99');
    expect(summary.introMonths).toBe(3);
    expect(summary.firstCharge).toBe('$1.00');
    expect(summary.introWindowTotal).toBe('$3.00');
    expect(summary.headline).toBe('$1.00 a month for 3 months, then $19.99 a month');
    expect(summary.finePrint).toContain('$1.00 today');
    expect(summary.finePrint).toContain('month 4');
  });

  it('supports a different offer shape without changing the maths', () => {
    const spec = { listAmountCents: 4900, introAmountCents: 900, introMonths: 2 };

    expect(computeIntroCouponAmountOff(spec)).toBe(4000);
    expect(buildIntroInvoiceSchedule(3, spec).map((invoice) => invoice.amountDue)).toEqual([
      900, 900, 4900,
    ]);
  });
});
