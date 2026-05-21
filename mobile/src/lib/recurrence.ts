export type Recurrence =
  | { type: 'once'; due: string }
  | { type: 'daily' }
  | { type: 'weekly'; days: number[] };

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type TFn = (key: string, opts?: Record<string, unknown>) => string;

// `t` is optional: without it (e.g. unit tests) the original English strings
// are returned verbatim; with it, output is localized via i18n.
export function formatRecurrence(rec: Recurrence, t?: TFn): string {
  if (rec.type === 'once') {
    const d = new Date(rec.due + 'T00:00:00Z');
    if (!t) {
      return `Once on ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
    }
    const date = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return t('recurrence.onceOn', { date });
  }
  if (rec.type === 'daily') return t ? t('recurrence.daily') : 'Daily';
  if (rec.type === 'weekly') {
    if (rec.days.length === 7) return t ? t('recurrence.everyDay') : 'Every day';
    return [...rec.days]
      .sort((a, b) => a - b)
      .map((d) => (t ? t(`recurrence.dayShort.${DAY_KEYS[d]}`) : DAY_LABELS[d]))
      .join(' · ');
  }
  return t ? t('recurrence.unknown') : 'Unknown';
}
