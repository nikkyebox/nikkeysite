// O feed anunciava produto que a loja não tem e preço que a loja não cobra.
//
// Levantado no Merchant Center em 28/07/2026: 296 itens no feed contra 267 na
// vitrine. A diferença eram 29 produtos já apagados pelo painel — o clique no
// anúncio caía em "produto não encontrado". Entre eles, 12 com preço de
// rascunho (¥1), que o Google exibia por R$0,23.
import { describe, expect, it } from 'vitest';
import { isVisibleInternationally } from './firestore-products.js';
import { buildQuote } from './commerce.js';
import { minEffectiveYen } from '../../shared/pricing.js';

describe('quem entra no feed e no sitemap', () => {
  it('publica o produto normal', () => {
    expect(isVisibleInternationally({ id: 'p1' })).toBe(true);
  });

  // Soft delete: o painel mantém o documento como lápide para os navegadores
  // com cache aprenderem a remoção pelo delta. Ler a coleção crua sem filtrar
  // ressuscita o produto no Google.
  it('não publica produto apagado (__deleted)', () => {
    expect(isVisibleInternationally({ id: 'p1', __deleted: true })).toBe(false);
  });

  it('não publica produto oculto nem restrito ao Japão', () => {
    expect(isVisibleInternationally({ id: 'p1', hidden: true })).toBe(false);
    expect(isVisibleInternationally({ id: 'p1', deliveryRestrict: 'japan-only' })).toBe(false);
  });
});

// O preço do feed TEM de ser o que o checkout cobra. O Google compara os dois e
// suspende a conta por divergência.
describe('preço do feed = preço do checkout', () => {
  const rates = { BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150, source: 'fallback' };

  function cobradoNoCheckout(product) {
    const quote = buildQuote({
      requestedItems: [{ productId: product.id, variantId: 'small', quantity: 1 }],
      products: new Map([[product.id, product]]),
      country: 'Brasil', prefecture: '', state: 'SP', carrier: 'ems', paymentMethod: 'wise',
      coupon: null, redeemPoints: 0, negotiation: null, campaign: null, homePromotion: null, rates,
    });
    return quote.items[0].unitYen;
  }

  // Os três produtos que divergiam em produção: o feed não arredondava, então
  // anunciava mais barato do que a loja cobra.
  it.each([
    ['Fino máscara',   1600, 10, 1450],
    ['Fino óleo',      2600, 10, 2350],
    ['Tsubaki máscara', 1980, 10, 1800],
  ])('%s: ¥%i com %i%% → ¥%i nos dois', (_nome, preco, desconto, esperado) => {
    const product = {
      id: 'p1', name: 'Produto',
      prices: { small: preco, large: preco },
      variants: [{ id: 'small', label: 'Único', price: preco }],
      discountPercent: desconto,
      weightGrams: 300,
      stock: { unlimited: true },
    };

    expect(minEffectiveYen(product)).toBe(esperado);
    expect(cobradoNoCheckout(product)).toBe(esperado);
  });

  it('sem desconto, o preço base também é arredondado igual', () => {
    const product = {
      id: 'p1', name: 'Produto',
      prices: { small: 2445, large: 2445 },
      variants: [{ id: 'small', label: 'Único', price: 2445 }],
      weightGrams: 300,
      stock: { unlimited: true },
    };

    expect(minEffectiveYen(product)).toBe(2450);
    expect(cobradoNoCheckout(product)).toBe(2450);
  });

  // ¥1 era o preço de rascunho dos 12 produtos apagados. Se um deles voltar a
  // ficar visível, o feed e o checkout precisam pelo menos concordar.
  it('preço de rascunho não faz feed e checkout discordarem', () => {
    const product = {
      id: 'p1', name: 'Produto',
      prices: { small: 1, large: 1 },
      variants: [{ id: 'small', label: 'Único', price: 1 }],
      weightGrams: 300,
      stock: { unlimited: true },
    };

    expect(minEffectiveYen(product)).toBe(50);
    expect(cobradoNoCheckout(product)).toBe(50);
  });

  it('produto sem preço fica fora do feed', () => {
    expect(minEffectiveYen({ id: 'p1', prices: {} })).toBe(0);
    expect(minEffectiveYen({ id: 'p1' })).toBe(0);
  });
});
