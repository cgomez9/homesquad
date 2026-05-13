import en from '../src/i18n/locales/en.json';
import es from '../src/i18n/locales/es.json';

type Json = string | { [k: string]: Json };

function collectPaths(obj: Json, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(...collectPaths(value as Json, next));
  }
  return paths;
}

describe('translation parity', () => {
  it('es.json mirrors every key in en.json', () => {
    const enPaths = collectPaths(en as Json).sort();
    const esPaths = collectPaths(es as Json).sort();
    const missingInEs = enPaths.filter((p) => !esPaths.includes(p));
    const extraInEs = esPaths.filter((p) => !enPaths.includes(p));
    expect({ missingInEs, extraInEs }).toEqual({ missingInEs: [], extraInEs: [] });
  });
});
