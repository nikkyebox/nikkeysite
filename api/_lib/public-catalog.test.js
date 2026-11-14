import { describe, expect, it } from 'vitest';
import { publicProduct, toPlain } from '../_handlers/public-catalog.js';
import { isSafeMediaPath } from '../_handlers/media.js';

describe('catálogo público', () => {
  it('remove o custo e o marcador de exclusão', () => {
    const out = publicProduct('p1', { name: 'A', cost: 1200, __deleted: false, price: 3000 });
    expect(out).toEqual({ id: 'p1', name: 'A', price: 3000 });
    expect(JSON.stringify(out)).not.toContain('1200');
  });

  it('converte Timestamp em ms, inclusive aninhado', () => {
    const ts = { toMillis: () => 42 };
    expect(toPlain({ a: ts, b: [ts], c: { d: ts }, e: 'x' })).toEqual({ a: 42, b: [42], c: { d: 42 }, e: 'x' });
  });
});

describe('proxy de imagens', () => {
  it('só aceita arquivos dentro de products/', () => {
    expect(isSafeMediaPath('products/p1/17-abc.webp')).toBe(true);
    expect(isSafeMediaPath('users/u1/a.webp')).toBe(false);
    expect(isSafeMediaPath('products/../users/a.webp')).toBe(false);
    expect(isSafeMediaPath('products/p1')).toBe(false);
    expect(isSafeMediaPath('products/p1/a b.webp')).toBe(false);
  });
});
