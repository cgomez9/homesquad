export type Recurrence =
  | { type: 'once'; due: string; time?: string }
  | { type: 'daily'; times?: string[] }
  | { type: 'weekly'; days: number[]; times?: string[] };

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function formatTimes(times: string[] | undefined, t?: TFn): string {
  if (!times || times.length === 0) return '';
  const sorted = [...times].sort();
  const labels = sorted.map((hhmm) => {
    const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10));
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  });
  const join = t ? t('recurrence.timesJoin') : ', ';
  const joined = labels.join(join);
  return t ? t('recurrence.timesSuffix', { times: joined }) : ` · ${joined}`;
}

export function formatRecurrence(rec: Recurrence, t?: TFn): string {
  if (rec.type === 'once') {
    const d = new Date(rec.due + 'T00:00:00Z');
    const date = d.toLocaleDateString(
      t ? undefined : 'en-US',
      { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
    );
    const base = t
      ? t('recurrence.onceOn', { date })
      : `Once on ${date}`;
    return base + formatTimes(rec.time ? [rec.time] : undefined, t);
  }
  if (rec.type === 'daily') {
    const base = t ? t('recurrence.daily') : 'Daily';
    return base + formatTimes(rec.times, t);
  }
  if (rec.type === 'weekly') {
    let base: string;
    if (rec.days.length === 7) {
      base = t ? t('recurrence.everyDay') : 'Every day';
    } else {
      base = [...rec.days]
        .sort((a, b) => a - b)
        .map((d) => (t ? t(`recurrence.dayShort.${DAY_KEYS[d]}`) : DAY_LABELS[d]))
        .join(' · ');
    }
    return base + formatTimes(rec.times, t);
  }
  return t ? t('recurrence.unknown') : 'Unknown';
}
