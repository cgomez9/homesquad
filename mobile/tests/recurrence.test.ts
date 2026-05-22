import { formatRecurrence, type Recurrence } from '../src/lib/recurrence';

describe('formatRecurrence', () => {
  it('formats one-off with date', () => {
    expect(formatRecurrence({ type: 'once', due: '2026-05-09' })).toBe('Once on May 9, 2026');
  });

  it('formats daily', () => {
    expect(formatRecurrence({ type: 'daily' })).toBe('Daily');
  });

  it('formats weekly with single day', () => {
    expect(formatRecurrence({ type: 'weekly', days: [1] })).toBe('Mon');
  });

  it('formats weekly with multiple days in canonical order', () => {
    expect(formatRecurrence({ type: 'weekly', days: [5, 1, 3] })).toBe('Mon · Wed · Fri');
  });

  it('formats weekly with all 7 days as "Every day"', () => {
    expect(formatRecurrence({ type: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day');
  });
});

describe('formatRecurrence with times', () => {
  it('formats daily with one time (English)', () => {
    const rec: Recurrence = { type: 'daily', times: ['08:00'] };
    expect(formatRecurrence(rec)).toBe('Daily · 8:00 AM');
  });

  it('formats daily with two times (English, sorted)', () => {
    const rec: Recurrence = { type: 'daily', times: ['20:00', '08:00'] };
    expect(formatRecurrence(rec)).toBe('Daily · 8:00 AM, 8:00 PM');
  });

  it('formats weekly with days + times (English)', () => {
    const rec: Recurrence = { type: 'weekly', days: [1, 3, 5], times: ['07:00'] };
    // Days render via short labels separated by ' · ', then ' · ' + times.
    expect(formatRecurrence(rec)).toBe('Mon · Wed · Fri · 7:00 AM');
  });

  it('formats daily without times (legacy, English)', () => {
    const rec: Recurrence = { type: 'daily' };
    expect(formatRecurrence(rec)).toBe('Daily');
  });

  it('formats daily with empty times array (English)', () => {
    const rec: Recurrence = { type: 'daily', times: [] };
    expect(formatRecurrence(rec)).toBe('Daily');
  });
});
