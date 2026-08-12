import {
  INTRO_MONTHS,
  INTRO_TOTAL,
  MONTHLY_PRICE,
  SAVING_VS_ANNUAL,
  SAVING_VS_MONTHLY,
  SHOPIFY_BASIC_ANNUAL_MONTHLY,
  SHOPIFY_BASIC_MONTHLY,
  TWELVE_MONTH,
  usd,
} from '../data/pricing';

describe('pricing arithmetic', () => {
  it('quotes the plan the copy deck approved', () => {
    expect(MONTHLY_PRICE).toBe(19.99);
    expect(INTRO_TOTAL).toBe(1);
    expect(INTRO_MONTHS).toBe(3);
  });

  it('derives the twelve-month totals rather than hard-coding them', () => {
    // $1 + (9 x $19.99). The copy deck prints $182.91 in §3.11; that is an
    // arithmetic slip, and the deck's own verify note says these totals are
    // arithmetic. The page must show the correct number.
    expect(TWELVE_MONTH.rebelRemainder).toBeCloseTo(179.91, 2);
    expect(TWELVE_MONTH.rebelTotal).toBeCloseTo(180.91, 2);
  });

  it('derives the Shopify Basic totals from the single source constant', () => {
    expect(TWELVE_MONTH.shopifyIntro).toBe(SHOPIFY_BASIC_MONTHLY * 3);
    expect(TWELVE_MONTH.shopifyTotal).toBe(SHOPIFY_BASIC_MONTHLY * 12);
    expect(TWELVE_MONTH.shopifyAnnualTotal).toBe(SHOPIFY_BASIC_ANNUAL_MONTHLY * 12);
  });

  it('computes savings against both Shopify billing options', () => {
    expect(SAVING_VS_MONTHLY).toBe(287);
    expect(SAVING_VS_ANNUAL).toBe(167);
  });

  it('never quotes a saving larger than the difference actually is', () => {
    expect(SAVING_VS_MONTHLY).toBeLessThanOrEqual(
      TWELVE_MONTH.shopifyTotal - TWELVE_MONTH.rebelTotal
    );
    expect(SAVING_VS_ANNUAL).toBeLessThanOrEqual(
      TWELVE_MONTH.shopifyAnnualTotal - TWELVE_MONTH.rebelTotal
    );
  });
});

describe('usd', () => {
  it('drops empty cents and keeps real ones', () => {
    expect(usd(117)).toBe('$117');
    expect(usd(180.91)).toBe('$180.91');
    expect(usd(1)).toBe('$1');
  });

  it('groups thousands', () => {
    expect(usd(1234.5)).toBe('$1,234.50');
  });
});
