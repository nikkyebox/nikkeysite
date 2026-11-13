import { describe, expect, it } from 'vitest';
import { buildQuote, emsRateYen } from './commerce.js';

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
    // Sem o antigo desconto de 5% do cartão: a mercadoria é o que o cliente vê.
    expect(result.netProductsYen).toBe(2000);
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
  // convertidos cada um por conta própria. Agora cada linha é um valor inteiro
  // (shared/money.js) e o total cobrado é a soma exata das linhas exibidas.
  it('a soma das linhas exibidas fecha com o total, em valores inteiros', () => {
    const result = quote({
      requestedItems: [{ productId: 'p1', variantId: 'small', quantity: 3 }],
      coupon: { code: 'GLOBAL10', discountType: 'percentage', discount: 10 },
      redeemPoints: 500,
    });
    const { subtotal, couponDiscount, pointsDiscount, products, shipping, psFee, importDuty, paymentFee } = result.display;

    // Sem estas parcelas o teste passaria por vacuidade.
    expect(shipping).toBeGreaterThan(0);
    expect(psFee).toBeGreaterThan(0);
    expect(couponDiscount).toBeGreaterThan(0);
    expect(pointsDiscount).toBeGreaterThan(0);

    for (const valor of [subtotal, couponDiscount, pointsDiscount, products, shipping, psFee, result.total]) {
      expect(Number.isInteger(valor)).toBe(true);
    }
    expect(subtotal - couponDiscount - pointsDiscount).toBe(products);
    expect(products + shipping + psFee + importDuty + paymentFee).toBe(result.total);
  });

  it('não existe desconto de 5% no cartão nem no PIX', () => {
    const card = quote({ paymentMethod: 'card' });
    const pix = quote({ paymentMethod: 'pix' });
    // Mercadoria igual ao preço do produto (¥1.000), sem abatimento escondido.
    expect(card.netProductsYen).toBe(1000);
    expect(card.display.paymentDiscount).toBe(0);
    expect(card.display.products).toBe(card.display.subtotal);
    expect(pix.netProductsYen).toBe(1000);
    expect(pix.display.paymentDiscount).toBe(0);
  });

  // PIX direto: IOF de 3,5% + tarifa fixa de R$ 32, somados ao total cobrado.
  it('PIX em reais soma IOF e R$ 32 ao total; cartão não', () => {
    const card = quote({ paymentMethod: 'card' });
    const pix = quote({ paymentMethod: 'pix' });
    expect(card.display.paymentFee).toBe(0);
    expect(pix.display.pixBankFee).toBe(32);
    expect(pix.display.pixIof).toBe(Math.round(card.total * 0.035));
    expect(pix.display.paymentFee).toBe(pix.display.pixIof + 32);
    expect(pix.total).toBe(card.total + pix.display.paymentFee);
    expect(pix.display.products + pix.display.shipping + pix.display.psFee + pix.display.importDuty + pix.display.paymentFee).toBe(pix.total);
  });

  it('PIX fora do Brasil não soma taxa (a regra de país é validada em orders.js)', () => {
    const result = quote({ country: 'Portugal', paymentMethod: 'pix' });
    expect(result.currency).toBe('EUR');
    expect(result.display.paymentFee).toBe(0);
  });

  // EUA: imposto de importação pré-pago (DDP) de 12,5% dos produtos + US$ 2,77.
  it('EUA soma o imposto de importação pré-pago ao total', () => {
    const result = quote({ country: 'Estados Unidos', prefecture: '', state: 'CA' });
    const { products, shipping, psFee, importDuty, paymentFee } = result.display;
    expect(result.currency).toBe('USD');
    expect(importDuty).toBe(Math.round(products * 0.125 + 2.77));
    expect(importDuty).toBeGreaterThan(0);
    expect(paymentFee).toBe(0);
    expect(products + shipping + psFee + importDuty).toBe(result.total);
    expect(result.tax).toBe(0);
  });

  it('só os EUA pagam o imposto pré-pago', () => {
    for (const country of ['Canadá', 'Portugal', 'Brasil']) {
      expect(quote({ country }).display.importDuty).toBe(0);
    }
  });

  it('EUA só aceitam EMS', () => {
    expect(() => quote({ country: 'Estados Unidos', carrier: 'kozutsumi-air' })).toThrowError('shipping_unavailable');
  });

  it('cupom antigo com freeShipping não dá desconto nem zera o frete', () => {
    const normal = quote();
    const result = quote({ coupon: { code: 'FS', freeShipping: true } });
    expect(result.couponDiscountYen).toBe(0);
    expect(result.shippingYen).toBe(normal.shippingYen);
    expect(result.total).toBe(normal.total);
  });

  it('percentual do cupom nunca passa de 100%', () => {
    const result = quote({ coupon: { code: 'X', discountType: 'percentage', discount: 250 } });
    expect(result.couponDiscountYen).toBe(1000);
  });

  it('cupom de afiliado não empilha no produto que já tem desconto', () => {
    const emPromo = { ...product, discountPercent: 20 };
    const afiliado = { code: 'ANA', discountType: 'percentage', discount: 10, affiliateCode: 'ANA' };
    const result = quote({ products: new Map([['p1', emPromo]]), coupon: afiliado });
    expect(result.items[0].unitYen).toBe(800);
    expect(result.couponDiscountYen).toBe(0);
    const comum = quote({ products: new Map([['p1', emPromo]]), coupon: { ...afiliado, affiliateCode: undefined } });
    expect(comum.couponDiscountYen).toBe(80);
  });

  it('cupom com valor mínimo recusa carrinho abaixo dele', () => {
    expect(() => quote({ coupon: { code: 'MIN', discountType: 'percentage', discount: 10, minOrderValue: 5000 } })).toThrowError('coupon_minimum_not_met');
  });

  // Negociação: manual vale o que a vendedora deu; automática (aprovada pelo
  // servidor) é limitada a ¥300 por unidade do carrinho ATUAL.
  it('negociação manual da taxa PS vale o que a vendedora aprovou', () => {
    const result = quote({ negotiation: { status: 'approved', approvedBy: 'ana@loja.jp', type: 'ps_fee', approvedDiscountYen: 400 } });
    expect(result.psFeeYen).toBe(600);
    expect(result.psFeeDiscountYen).toBe(400);
  });

  it('negociação automática é limitada a ¥300 por unidade', () => {
    const result = quote({ negotiation: { status: 'auto_approved', approvedBy: 'system', type: 'ps_fee', approvedDiscountYen: 5000 } });
    expect(result.psFeeDiscountYen).toBe(300);
    expect(result.psFeeYen).toBe(700);
  });

  it('aprovação gravada pelo navegador (approvedBy auto) segue recusada', () => {
    const result = quote({ negotiation: { status: 'approved', approvedBy: 'auto', type: 'ps_fee', approvedDiscountYen: 300 } });
    expect(result.psFeeDiscountYen).toBe(0);
    expect(result.psFeeYen).toBe(1000);
  });

  it('isenção da taxa PS zera a taxa; pontos que cobrem tudo a devolvem cheia', () => {
    expect(quote({ psFeeWaived: true }).psFeeYen).toBe(0);
    const cobertura = quote({ psFeeWaived: true, redeemPoints: 99999 });
    expect(cobertura.psFeeYen).toBe(1000);
    expect(cobertura.display.products).toBe(0);
  });

  // Iene não tem centavo: a taxa efetiva é 1 e cada linha exibida é o próprio
  // valor em iene, sem sobra de arredondamento para realocar.
  it('o caminho do iene fica inteiro e o total exibido é o cobrado', () => {
    const result = quote({
      country: 'Japão', prefecture: 'Tokyo', carrier: 'yuubin',
      coupon: { code: 'GLOBAL10', discountType: 'percentage', discount: 10 },
    });
    const { subtotal, couponDiscount, pointsDiscount, products, shipping, psFee, tax, importDuty, paymentFee } = result.display;

    for (const valor of [subtotal, couponDiscount, products, shipping, psFee, tax, result.total]) {
      expect(Number.isInteger(valor)).toBe(true);
    }
    expect(tax).toBe(0);
    expect(result.total).toBe(result.totalYen);
    expect(subtotal - couponDiscount - pointsDiscount).toBe(products);
    expect(products + shipping + psFee + importDuty + paymentFee).toBe(result.total);
  });

  it('cotação ausente recusa o pedido em vez de cobrar zero', () => {
    expect(() => quote({ rates: { source: 'open-er' } })).toThrowError('fx_unavailable');
  });
});

describe('emsRateYen — tabela EMS alinhada à referência', () => {
  it('zona 4 (EUA) usa faixas de 1 kg acima de 10 kg, não degraus de 5 kg', () => {
    expect(emsRateYen(15000, 4)).toBe(39100);
    expect(emsRateYen(20000, 4)).toBe(51100);
    expect(emsRateYen(25000, 4)).toBe(63100);
    expect(emsRateYen(30000, 4)).toBe(75100);
  });

  it('zona 4 abaixo de 10 kg e faixas intermediárias', () => {
    expect(emsRateYen(3000, 4)).toBe(10300);
    expect(emsRateYen(603, 4)).toBe(4460);
  });

  it('acima de 30 kg não há tarifa', () => {
    expect(emsRateYen(30001, 4)).toBeNull();
  });
});
