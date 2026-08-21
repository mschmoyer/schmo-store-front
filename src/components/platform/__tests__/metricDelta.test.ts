import {
  conversionPct,
  formatPct,
  formatPercentChange,
  readDelta,
} from '@/components/platform/metricDelta';

/**
 * These are the console's arithmetic, and the cases below are the ones that produce a visible lie
 * when they go wrong: a zero baseline printed as `+100%`, a fall in refunds coloured as bad news,
 * an empty funnel printed as `NaN%`. Each has been seen in a real dashboard.
 */
describe('readDelta', () => {
  it('reports a signed percentage against a real baseline', () => {
    expect(readDelta(150, 100).pct).toBeCloseTo(50);
    expect(readDelta(50, 100).pct).toBeCloseTo(-50);
  });

  it('refuses to divide by an empty baseline', () => {
    const reading = readDelta(5, 0);
    expect(reading.pct).toBeNull();
    expect(Number.isFinite(reading.pct as number)).toBe(false);
    expect(reading.direction).toBe('up');
  });

  it('returns null rather than NaN for non-finite input', () => {
    expect(readDelta(Number.NaN, 10).pct).toBeNull();
    expect(readDelta(10, Number.NaN).pct).toBeNull();
  });

  it('reads a rise as good news only when up is good', () => {
    expect(readDelta(150, 100, 'up-is-good').tone).toBe('good');
    expect(readDelta(150, 100, 'down-is-good').tone).toBe('bad');
  });

  it('reads a fall in refunds as good news', () => {
    const refunds = readDelta(2_000, 5_000, 'down-is-good');
    expect(refunds.direction).toBe('down');
    expect(refunds.tone).toBe('good');
  });

  it('treats no movement as neutral in both polarities', () => {
    expect(readDelta(100, 100, 'up-is-good')).toMatchObject({ direction: 'flat', tone: 'neutral' });
    expect(readDelta(100, 100, 'down-is-good')).toMatchObject({ direction: 'flat', tone: 'neutral' });
  });

  it('compares money as integer cents without converting to dollars', () => {
    /* $31.05 against $10.35 — the ratio is the same whichever unit, which is the point. */
    expect(readDelta(3_105, 1_035).pct).toBeCloseTo(200);
  });
});

describe('conversionPct', () => {
  it('measures one funnel step against the one above it', () => {
    expect(conversionPct(19, 83)).toBeCloseTo(22.891, 2);
  });

  it('returns null for an empty predecessor rather than 0% or NaN%', () => {
    expect(conversionPct(0, 0)).toBeNull();
    expect(conversionPct(5, 0)).toBeNull();
    expect(conversionPct(5, -1)).toBeNull();
  });

  it('reports a step that exceeds its predecessor as measured', () => {
    /* Independent event rows, not a nested cohort: over 100% is possible and is not massaged. */
    expect(conversionPct(120, 100)).toBeCloseTo(120);
  });
});

describe('formatting', () => {
  it('signs a percentage change with a typographic minus', () => {
    expect(formatPercentChange(12.34)).toBe('+12.3%');
    expect(formatPercentChange(-3)).toBe('−3.0%');
    expect(formatPercentChange(0)).toBe('+0.0%');
  });

  it('renders an unmeasurable percentage as an em dash', () => {
    expect(formatPct(null)).toBe('—');
  });

  it('keeps a decimal only where it carries information', () => {
    expect(formatPct(4.25)).toBe('4.3%');
    expect(formatPct(73.68)).toBe('74%');
  });
});
