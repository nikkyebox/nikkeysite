import { describe, expect, it } from 'vitest';
import { translations, Language } from './translations';

const LANGUAGES = Object.keys(translations) as Language[];

describe('translations dictionary integrity', () => {
  it('defines the three supported languages', () => {
    expect([...LANGUAGES].sort()).toEqual(['en', 'ja', 'pt']);
  });

  it('has no empty string values', () => {
    const empties: string[] = [];
    for (const lang of LANGUAGES) {
      for (const [key, value] of Object.entries(translations[lang])) {
        if (value.trim() === '') empties.push(`${lang}.${key}`);
      }
    }
    expect(empties).toEqual([]);
  });

  it('keeps every key in sync across all languages (catches missing/orphaned translations)', () => {
    const keySets = LANGUAGES.map((lang) => new Set(Object.keys(translations[lang])));
    const [reference, ...rest] = keySets;
    const referenceLang = LANGUAGES[0];

    const problems: string[] = [];
    rest.forEach((keys, idx) => {
      const lang = LANGUAGES[idx + 1];
      const missing = [...reference].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !reference.has(k));
      if (missing.length) problems.push(`${lang} is missing keys present in ${referenceLang}: ${missing.join(', ')}`);
      if (extra.length) problems.push(`${lang} has keys not present in ${referenceLang}: ${extra.join(', ')}`);
    });

    expect(problems).toEqual([]);
  });

  it('never lets a value literally equal its own key (silent fallback indicator)', () => {
    const selfEcho: string[] = [];
    for (const lang of LANGUAGES) {
      for (const [key, value] of Object.entries(translations[lang])) {
        if (value === key) selfEcho.push(`${lang}.${key}`);
      }
    }
    expect(selfEcho).toEqual([]);
  });
});
