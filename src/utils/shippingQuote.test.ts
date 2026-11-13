import { describe, expect, it } from 'vitest';
import type { CartItem, Product } from '@/types';
import { japanPrefectures, japanShippingRates } from '@/data/japanPrefectures';
import { quoteShipping } from './shippingQuote';

// Valores em ¥ conferidos contra as tabelas de src/utils/japanPostRates.ts
// (e-Packet Light / Air Parcel / EMS), que são as mesmas do servidor
// (api/_lib/commerce.js). costYen é o valor em ¥, independente do câmbio.

const product = (extra: Record<string, unknown> = {}): Product => ({
  id: 'p1',
  name: 'Test Product',
  description: '',
  category: 'test',
  prices: { small: 1000, large: 2000 },
  image: '',
  flavor: '',
  ...extra,
}) as unknown as Product;

const item = (p: Product, quantity = 1, size = 'small'): CartItem => ({
  product: p,
  quantity,
  size,
}) as CartItem;

const byCarrier = (options: ReturnType<typeof quoteShipping>['options'], carrier: string) =>
  options.find((o) => o.carrier === carrier);

describe('quoteShipping — internacional (Brasil, zona 5)', () => {
  it('peso não conferido: 303 g ganha 200 g de embalagem + 100 g de caixa = 603 g', () => {
    const q = quoteShipping([item(product({ weightGrams: 303 }))], 'Brasil');
    expect(q.boxes.totalWeightG).toBe(603);
    expect(byCarrier(q.options, 'eraito')?.costYen).toBe(2480); // e-Packet Light 603 g
    expect(byCarrier(q.options, 'ems')?.costYen).toBe(4200); // EMS faixa de 700 g
  });

  it('peso conferido: 3 × 303 g = 909 g + 100 g de caixa = 1009 g (sem margem por unidade)', () => {
    const q = quoteShipping([item(product({ weightGrams: 303, weightVerified: true }), 3)], 'Brasil');
    expect(q.boxes.totalWeightG).toBe(1009);
    expect(byCarrier(q.options, 'eraito')?.costYen).toBe(3520);
    expect(byCarrier(q.options, 'ems')?.costYen).toBe(5850); // EMS faixa de 1250 g
  });

  it('peso não conferido: 3 × 303 g = 1509 g + 100 g de caixa = 1609 g', () => {
    const q = quoteShipping([item(product({ weightGrams: 303 }), 3)], 'Brasil');
    expect(q.boxes.totalWeightG).toBe(1609);
    expect(byCarrier(q.options, 'eraito')?.costYen).toBe(5080);
    expect(byCarrier(q.options, 'ems')?.costYen).toBe(7350); // EMS faixa de 1750 g
  });

  it('acima de 2 kg não oferece e-Packet Light e usa Kozutsumi Air (zona 5)', () => {
    const q = quoteShipping([item(product({ weightGrams: 2500 }))], 'Brasil');
    expect(q.boxes.totalWeightG).toBe(2600);
    expect(byCarrier(q.options, 'eraito')).toBeUndefined();
    expect(byCarrier(q.options, 'kozutsumi-air')?.costYen).toBe(9950);
  });

  it('acima de 30 kg: marcado como fora de faixa e sem opções', () => {
    const q = quoteShipping([item(product({ weightGrams: 2500 }), 13)], 'Brasil');
    expect(q.boxes.totalWeightG).toBe(32600);
    expect(q.isOverweight).toBe(true);
    expect(q.options).toEqual([]);
  });
});

describe('quoteShipping — Estados Unidos (DDP)', () => {
  it('só oferece EMS, com imposto pré-pago, na zona 4', () => {
    const q = quoteShipping([item(product({ weightGrams: 303 }))], 'Estados Unidos');
    expect(q.options.map((o) => o.carrier)).toEqual(['ems']);
    expect(q.options[0].costYen).toBe(4460); // zona 4, faixa de 700 g
    expect(q.options[0].estimatedDays).toBe('10-12');
  });
});

describe('quoteShipping — Japão', () => {
  it('sem província escolhida: pede a província e não cota', () => {
    const q = quoteShipping([item(product())], 'Japão');
    expect(q.needsPrefecture).toBe(true);
    expect(q.options).toEqual([]);
  });

  it('com província: 1 caixa de 60 cm pela tabela da zona da província', () => {
    const tokyo = japanPrefectures.find((p) => p.name === 'Tokyo');
    expect(tokyo).toBeDefined();
    const zone = tokyo!.zone as 1 | 2 | 3 | 4;
    const q = quoteShipping([item(product())], 'Japão', { prefecture: 'Tokyo' });
    for (const carrier of ['yuubin', 'yamato', 'sagawa'] as const) {
      expect(byCarrier(q.options, carrier)?.cost).toBe(japanShippingRates[carrier]['60'][zone]);
    }
  });

  it('acima de ¥6.000 continua pagando o frete da zona (não existe frete grátis)', () => {
    const tokyo = japanPrefectures.find((p) => p.name === 'Tokyo')!;
    const zone = tokyo.zone as 1 | 2 | 3 | 4;
    const q = quoteShipping([item(product({ prices: { small: 7000, large: 8000 } }))], 'Japão', { prefecture: 'Tokyo' });
    const yamato = byCarrier(q.options, 'yamato');
    expect(yamato?.cost).toBe(japanShippingRates.yamato['60'][zone]);
    expect(yamato?.cost).toBeGreaterThan(0);
  });
});

describe('quoteShipping — país que o servidor recusa', () => {
  it('"Outros" não tem cotação online (servidor responde unsupported_country)', () => {
    const q = quoteShipping([item(product({ weightGrams: 303 }))], 'Outros');
    expect(q.unsupportedCountry).toBe(true);
    expect(q.options).toEqual([]);
  });

  it('países aceitos pelo servidor seguem cotados', () => {
    const q = quoteShipping([item(product({ weightGrams: 303 }))], 'Brasil');
    expect(q.unsupportedCountry).toBe(false);
    expect(q.options.length).toBeGreaterThan(0);
  });
});
