import { describe, expect, it } from 'vitest';
import { getCurrencyByCountry, toYen } from './currency';

describe('regional currency policy', () => {
  it.each([
    ['Brasil', 'BRL'],
    ['Japão', 'JPY'],
    ['Portugal', 'EUR'],
    ['França', 'EUR'],
    ['Estados Unidos', 'USD'],
    ['Outros', 'USD'],
    ['', 'USD'],
    ['País não cadastrado', 'USD'],
  ])('maps %s to %s', (country, expected) => {
    expect(getCurrencyByCountry(country)).toBe(expected);
  });

  it('converts explicit USD totals back to yen instead of treating them as JPY', () => {
    expect(toYen(10, 'USD')).toBeGreaterThan(100);
    expect(toYen(10, 'JPY')).toBe(10);
  });

  it('keeps historical totals with no currency as yen to avoid inflating legacy data', () => {
    expect(toYen(900)).toBe(900);
    expect(toYen(900, 'UNKNOWN')).toBe(900);
  });
});
