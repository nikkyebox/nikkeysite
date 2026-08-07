import { describe, expect, it } from 'vitest';
import { calcBrazilTax, calcImportTax } from './taxRules';

describe('tax estimation policy', () => {
  it.each([100, 500])('does not estimate Brazilian taxes for a price of %s', (price) => {
    const tax = calcBrazilTax(price);

    expect(tax.federal).toBe(0);
    expect(tax.icms).toBe(0);
    expect(tax.total).toBe(0);
  });

  it('suppresses Brazil import tax estimates and their labels', () => {
    expect(calcImportTax(500, 'Brasil')).toEqual({ tax: 0, label: '' });
  });

  it('keeps estimating VAT for Portugal', () => {
    const estimate = calcImportTax(500, 'Portugal');

    expect(estimate.tax).toBeGreaterThan(0);
    expect(estimate.label).toMatch(/IVA|VAT/);
  });
});
