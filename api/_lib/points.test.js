// A tela do checkout prometia 100 pontos e o servidor creditava 85 quando havia
// cupom e pagamento em PIX: eram duas contas diferentes para a mesma regra.
//
// A regra escolhida é a generosa — desconto não corta ponto. O cliente ganha
// sobre o valor cheio da mercadoria. Estes testes prendem as duas pontas na
// mesma função e fixam o que NÃO gera ponto.
import { describe, expect, it } from 'vitest';
import { buildQuote } from './commerce.js';
import { earnedPointsForOrder } from '../../shared/points.js';

const rates = { BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150, source: 'fallback' };
const produto = {
  id: 'p1', name: 'Produto',
  prices: { small: 5000, large: 5000 },
  variants: [{ id: 'small', label: 'Único', price: 5000 }],
  weightGrams: 300,
  stock: { unlimited: true },
};

/** Pedido de 2 unidades de ¥5.000 = ¥10.000 em mercadoria. */
function pedido(extra = {}) {
  return buildQuote({
    requestedItems: [{ productId: 'p1', variantId: 'small', quantity: 2 }],
    products: new Map([['p1', produto]]),
    country: 'Brasil', prefecture: '', state: 'SP', carrier: 'ems',
    paymentMethod: 'wise', coupon: null, redeemPoints: 0,
    negotiation: null, campaign: null, homePromotion: null, rates,
    ...extra,
  });
}

const CUPOM_10 = { code: 'X', discountType: 'percentage', discount: 10, source: 'global' };

describe('pontos do pedido', () => {
  it('1 ponto a cada ¥100 de mercadoria', () => {
    expect(pedido().earnedPoints).toBe(100);
  });

  // Frete e taxa do personal shopper (¥1.000 por item) entram no total pago,
  // mas não na base de pontos: ponto é sobre mercadoria.
  it('frete e taxa do personal shopper não geram ponto', () => {
    const q = pedido();

    expect(q.psFeeYen).toBe(2000);
    expect(q.shippingYen).toBeGreaterThan(0);
    // ¥10.000 + ¥2.000 + frete pagos, e ainda assim 100 pontos.
    expect(q.earnedPoints).toBe(100);
  });

  it('cupom não corta ponto', () => {
    const q = pedido({ coupon: CUPOM_10 });

    expect(q.couponDiscountYen).toBe(1000);
    expect(q.earnedPoints).toBe(100);
  });

  it('desconto de pagamento (PIX/cartão) não corta ponto', () => {
    expect(pedido({ paymentMethod: 'pix' }).earnedPoints).toBe(100);
    expect(pedido({ paymentMethod: 'card' }).earnedPoints).toBe(100);
  });

  it('cupom e PIX juntos continuam pagando os 100', () => {
    expect(pedido({ paymentMethod: 'pix', coupon: CUPOM_10 }).earnedPoints).toBe(100);
  });

  // Sem isto o resgate se pagaria sozinho: ¥1.000 em pontos viraria ¥1.000 de
  // compra que devolve mais 10 pontos, sem fim.
  it('o que foi pago com pontos sai da base', () => {
    const q = pedido({ redeemPoints: 3000 });

    expect(q.redeemPoints).toBe(3000);
    expect(q.earnedPoints).toBe(70); // (10.000 − 3.000) / 100
  });

  // A tela do checkout chama exatamente esta função com os mesmos argumentos.
  it('a tela e o servidor chegam ao mesmo número', () => {
    for (const extra of [{}, { paymentMethod: 'pix' }, { coupon: CUPOM_10 }, { redeemPoints: 2500 }]) {
      const q = pedido(extra);
      expect(earnedPointsForOrder(q.productSubtotalYen, q.redeemPoints)).toBe(q.earnedPoints);
    }
  });

  it('não devolve ponto negativo quando o resgate cobre tudo', () => {
    expect(earnedPointsForOrder(10000, 99999)).toBe(0);
    expect(earnedPointsForOrder(0, 0)).toBe(0);
  });
});

// Ponto paga mercadoria. Frete e taxa do personal shopper são serviço prestado
// — se o resgate pudesse cobri-los, um pedido grande o bastante sairia com a
// loja pagando a remessa do próprio bolso.
describe('no que o ponto pode ser gasto', () => {
  it('resgate absurdo zera os produtos e não encosta no frete nem na taxa', () => {
    const q = pedido({ redeemPoints: 99999 });

    expect(q.redeemPoints).toBe(10000);      // teto = subtotal dos produtos
    expect(q.netProductsYen).toBe(0);
    expect(q.shippingYen).toBeGreaterThan(0);
    expect(q.psFeeYen).toBe(2000);
    expect(q.total).toBeGreaterThan(0);      // ainda sobra frete + taxa a pagar
  });

  it('o teto respeita o cupom, para o total da tela bater com o cobrado', () => {
    const q = pedido({ redeemPoints: 10000, coupon: CUPOM_10 });

    expect(q.couponDiscountYen).toBe(1000);
    expect(q.redeemPoints).toBe(9000);
  });
});

// A taxa é a margem do serviço. Ela volta ao valor cheio somente quando os
// pontos cobrem toda a mercadoria; resgate parcial não perde benefícios.
describe('pontos com benefício na taxa de personal shopper', () => {
  const negociacaoAprovada = {
    type: 'ps_fee',
    status: 'approved',
    approvedBy: 'admin-uid',
    approvedDiscountYen: 1500,
  };

  it('resgate parcial convive com a taxa negociada', () => {
    const q = pedido({ redeemPoints: 2000, negotiation: negociacaoAprovada });
    expect(q.redeemPoints).toBe(2000);
    expect(q.psFeeYen).toBe(500);
  });

  it('pontos que zeram a mercadoria restauram a taxa cheia', () => {
    const q = pedido({ redeemPoints: 10000, negotiation: negociacaoAprovada });
    expect(q.netProductsYen).toBe(0);
    expect(q.psFeeYen).toBe(2000);
  });

  it('oferta de saída zera a taxa quando ainda há mercadoria a pagar', () => {
    const q = pedido({ redeemPoints: 2000, psFeeWaived: true });
    expect(q.netProductsYen).toBeGreaterThan(0);
    expect(q.psFeeYen).toBe(0);
    expect(q.psFeeWaiverApplied).toBe(true);
  });

  it('oferta de saída não zera a taxa quando pontos cobrem tudo', () => {
    const q = pedido({ redeemPoints: 10000, psFeeWaived: true });
    expect(q.netProductsYen).toBe(0);
    expect(q.psFeeYen).toBe(2000);
    expect(q.psFeeWaiverApplied).toBe(false);
  });

  // Só a taxa PS é protegida. Frete negociado continua convivendo com pontos.
  it('desconto negociado no frete convive com pontos', () => {
    const q = pedido({
      redeemPoints: 2000,
      negotiation: { type: 'shipping', status: 'approved', approvedBy: 'admin-uid', approvedDiscountYen: 500 },
    });
    expect(q.redeemPoints).toBe(2000);
    expect(q.shippingYen).toBe(4600);
  });
});
