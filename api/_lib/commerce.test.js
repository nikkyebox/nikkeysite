import { describe, expect, it } from 'vitest';
import { buildQuote } from './commerce.js';

const rates = { BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150, source: 'fallback' };
const product = {
  id: 'p1',
  name: 'Produto',
  prices: { small: 1000, large: 2000 },
  weightGrams: 500,
  stock: { unlimited: false, quantity: 10 },
};

function quote(overrides = {}) {
  return buildQuote({
    requestedItems: [{ productId: 'p1', variantId: 'small', quantity: 1 }],
    products: new Map([['p1', product]]),
    country: 'Brasil',
    prefecture: 'SP',
    state: 'SP',
    carrier: 'ems',
    paymentMethod: 'card',
    coupon: null,
    redeemPoints: 0,
    negotiation: null,
    campaign: null,
    homePromotion: null,
    rates,
    ...overrides,
  });
}

describe('authoritative checkout quote', () => {
  it('derives item price and regional currency from server data', () => {
    const result = quote({ requestedItems: [{ productId: 'p1', variantId: 'small', quantity: 2, price: 1, total: 1 }] });
    expect(result.items[0].unitYen).toBe(1000);
    expect(result.productSubtotalYen).toBe(2000);
    expect(result.netProductsYen).toBe(1900);
    expect(result.currency).toBe('BRL');
    expect(result.total).toBeGreaterThan(1);
  });

  it('uses USD outside Brazil, Japan, and the eurozone', () => {
    expect(quote({ country: 'Canadá' }).currency).toBe('USD');
    expect(quote({ country: 'Portugal' }).currency).toBe('EUR');
    expect(quote({ country: 'Japão', prefecture: 'Tokyo', carrier: 'yuubin' }).currency).toBe('JPY');
  });

  it('rejects a home promotion quantity above the per-person limit', () => {
    expect(() => quote({
      requestedItems: [{ productId: 'p1_promo', variantId: 'small', quantity: 2 }],
      homePromotion: { productId: 'p1', promoPriceYen: 500, limitPerPerson: 1, maxProducts: 10, soldCount: 0 },
    })).toThrowError('promotion_limit');
  });

  it('reconstructs campaign gifts instead of trusting free client lines', () => {
    const gift = { ...product, id: 'gift', name: 'Brinde', stock: { unlimited: false, quantity: 4 } };
    const result = quote({
      products: new Map([['p1', product], ['gift', gift]]),
      campaign: { mechanic: 'bogo_other', productId: 'p1', giftProductId: 'gift', keepProductDiscount: true },
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[1]).toMatchObject({ productId: 'gift', freeGift: true, unitYen: 0, quantity: 1 });
  });

  it('rejects a carrier that is unavailable for the cart weight', () => {
    expect(() => quote({ carrier: 'kozutsumi-air' })).toThrowError('invalid_shipping');
  });

  // Regressão do CRÍTICO #1 do AUDITORIA.md: o cupom de recuperação de
  // carrinho grava o percentual em `discountPercent` e deixa `discount: 0`
  // (legado). Lendo `discount` no ramo 'percentage', todo cupom de
  // recuperação valia 0% — a tela prometia 30% OFF e o pedido saía cheio.
  it('aplica o percentual do cupom de recuperação, que vem em discountPercent', () => {
    const result = quote({
      requestedItems: [{ productId: 'p1', variantId: 'small', quantity: 1 }],
      coupon: { code: 'VOLTA30', type: 'percent', discountType: 'percentage', discount: 0, discountPercent: 30 },
    });
    expect(result.couponDiscountYen).toBe(300);
  });

  it('mantém o cupom global, que traz o percentual em discount', () => {
    const result = quote({
      coupon: { code: 'GLOBAL10', discountType: 'percentage', discount: 10 },
    });
    expect(result.couponDiscountYen).toBe(100);
  });

  // Regressão do CRÍTICO #3: `remaining` era calculado e descartado. O limite
  // de unidades só era conferido no fulfillment — depois de cobrar o cartão,
  // deixando o pedido preso em `payment_review`.
  it('recusa a promoção da home quando o estoque promocional acabou', () => {
    expect(() => quote({
      requestedItems: [{ productId: 'p1_promo', variantId: 'small', quantity: 1 }],
      homePromotion: { productId: 'p1', promoPriceYen: 500, limitPerPerson: 5, maxProducts: 10, soldCount: 10 },
    })).toThrowError('promotion_unavailable');
  });

  it('conta as reservas em aberto no limite da promoção', () => {
    expect(() => quote({
      requestedItems: [{ productId: 'p1_promo', variantId: 'small', quantity: 2 }],
      homePromotion: { productId: 'p1', promoPriceYen: 500, limitPerPerson: 5, maxProducts: 10, soldCount: 8, reservedCount: 1 },
    })).toThrowError('promotion_unavailable');
  });

  it('ainda vende enquanto sobra unidade promocional', () => {
    const result = quote({
      requestedItems: [{ productId: 'p1_promo', variantId: 'small', quantity: 2 }],
      homePromotion: { productId: 'p1', promoPriceYen: 500, limitPerPerson: 5, maxProducts: 10, soldCount: 8 },
    });
    expect(result.homePromoQuantity).toBe(2);
  });

  // Regressão do MEDIO 1 do AUDITORIA.md: o `fulfillment.js` somava
  // `order.promoPoints` no saldo do cliente, mas nenhum lugar gravava esse
  // campo. A campanha "Compre e Ganhe pontos" era anunciada por e-mail e push
  // e creditava zero.
  it('credita os pontos da campanha quando o produto dela está no carrinho', () => {
    const result = quote({
      campaign: { mechanic: 'points', productId: 'p1', points: 250 },
    });
    expect(result.promoPoints).toBe(250);
  });

  // As outras mecânicas são todas presas ao produto da campanha. Sem isto
  // bastava colar o código com qualquer carrinho para levar os pontos.
  it('não credita se o produto da campanha não está no carrinho', () => {
    const outro = { ...product, id: 'p2' };
    const result = quote({
      requestedItems: [{ productId: 'p2', variantId: 'small', quantity: 1 }],
      products: new Map([['p2', outro]]),
      campaign: { mechanic: 'points', productId: 'p1', points: 250 },
    });
    expect(result.promoPoints).toBe(0);
  });

  it('não credita ponto em campanha de outra mecânica', () => {
    const result = quote({
      campaign: { mechanic: 'discount', productId: 'p1', discountPct: 10, points: 250 },
    });
    expect(result.promoPoints).toBe(0);
  });

  it('pedido sem campanha não gera ponto promocional', () => {
    expect(quote().promoPoints).toBe(0);
  });

  // Regressão do BAIXO 1 do AUDITORIA.md: produtos, frete e subtotal eram
  // convertidos cada um por conta própria, com cushion de 4% mais ¥5 de buffer
  // por linha, enquanto cupom, pontos e taxa PS iam pela taxa exata. O cushion
  // nunca alcançava os descontos, então a conta da tela ficava 4% dos descontos
  // acima do total cobrado — cerca de R$2 num pedido com ¥1.500 de cupom.
  // A prova é que a soma das linhas exibidas agora fecha com o total.
  it('a soma das linhas exibidas fecha com o total', () => {
    const result = quote({
      requestedItems: [{ productId: 'p1', variantId: 'small', quantity: 3 }],
      coupon: { code: 'GLOBAL10', discountType: 'percentage', discount: 10 },
      redeemPoints: 500,
    });
    const { products, shipping, psFee, tax } = result.display;

    // Sem estas parcelas o teste passaria por vacuidade.
    expect(shipping).toBeGreaterThan(0);
    expect(psFee).toBeGreaterThan(0);
    expect(tax).toBeGreaterThan(0);

    // A invariante essencial: as linhas exibidas devem somar exatamente o total,
    // em centavos inteiros (para evitar ruído de float).
    const centavos = (valor) => Math.round(valor * 100);
    expect(centavos(products) + centavos(shipping) + centavos(psFee) + centavos(tax))
      .toBe(centavos(result.total));
  });

  // Iene não tem centavo: a taxa efetiva é 1 e cada linha exibida é o próprio
  // valor em iene, sem sobra de arredondamento para realocar.
  it('o caminho do iene fica inteiro e o total exibido é o cobrado', () => {
    const result = quote({
      country: 'Japão', prefecture: 'Tokyo', carrier: 'yuubin',
      coupon: { code: 'GLOBAL10', discountType: 'percentage', discount: 10 },
    });
    const { subtotal, couponDiscount, pointsDiscount, paymentDiscount, products, shipping, psFee, tax } = result.display;

    for (const valor of [subtotal, couponDiscount, products, shipping, psFee, tax, result.total]) {
      expect(Number.isInteger(valor)).toBe(true);
    }
    expect(tax).toBe(0);
    expect(result.total).toBe(result.totalYen);
    expect(subtotal - couponDiscount - pointsDiscount - paymentDiscount).toBe(products);
    expect(products + shipping + psFee + tax).toBe(result.total);
  });
});
