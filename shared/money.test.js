import { describe, expect, it } from 'vitest';
import {
  PIX_BANK_FEE_BRL,
  autoApprovablePsDiscountYen,
  couponTerms,
  discountYenToDisplay,
  displayTotals,
  paymentMethodsForCountry,
  pixFees,
  productBenefits,
  psFeeDiscountYen,
  rateCushion,
  usImportDuty,
  yenToDisplay,
} from './money.js';

const OPEN = { BRL: 0.0345, EUR: 0.0061, USD: 0.0067, source: 'open-er' };
const WISE = { BRL: 0.0331, EUR: 0.0059, USD: 0.0064, source: 'wise' };

const line = (unitYen, quantity = 1, extra = {}) => ({ unitYen, quantity, freeGift: false, homePromo: false, noPsFee: false, ...extra });

function totals({ lines, coupon = null, redeemPoints = 0, currency = 'BRL', country = 'Brasil', paymentMethod = 'card', rates = OPEN, shippingYen = 0, psFeeWaived = false, negotiatedYen = 0 }) {
  const benefits = productBenefits({ lines, coupon, redeemPoints });
  const psDiscount = psFeeDiscountYen({
    psFeeYen: benefits.psFeeYen,
    pointsCoverAllProducts: benefits.pointsCoverAllProducts,
    psFeeWaived,
    negotiatedDiscountYen: negotiatedYen,
  });
  const shown = displayTotals({
    currency, rates, country, paymentMethod, lines, benefits,
    finalShippingYen: shippingYen,
    psFeeFinalYen: benefits.psFeeYen - psDiscount,
  });
  return { benefits, shown };
}

describe('yenToDisplay', () => {
  it('JPY é o próprio valor, inteiro', () => {
    expect(yenToDisplay(1480, 'JPY', OPEN)).toBe(1480);
    expect(yenToDisplay(1480.4, 'JPY', OPEN)).toBe(1480);
  });

  it('soma ¥5 por unidade e aplica o cushion de 4% fora da Wise', () => {
    // (1000 + 5) * 0.0345 * 1.04 = 36.0594
    expect(yenToDisplay(1000, 'BRL', OPEN)).toBe(36);
    expect(rateCushion(OPEN)).toBe(0.04);
  });

  it('na Wise o cushion é zero', () => {
    // (1000 + 5) * 0.0331 = 33.2655
    expect(yenToDisplay(1000, 'BRL', WISE)).toBe(33);
    expect(rateCushion(WISE)).toBe(0);
  });

  it('exact tira a margem de ¥5 e o cushion (taxa PS)', () => {
    expect(yenToDisplay(1000, 'BRL', OPEN, { exact: true })).toBe(35);
    expect(yenToDisplay(1000, 'USD', OPEN, { exact: true })).toBe(7);
  });

  it('valor zero ou negativo é zero; cotação ausente não quebra', () => {
    expect(yenToDisplay(0, 'BRL', OPEN)).toBe(0);
    expect(yenToDisplay(-10, 'BRL', OPEN)).toBe(0);
    expect(yenToDisplay(1000, 'BRL', {})).toBe(0);
  });

  it('desconto em ¥ usa a mesma taxa, sem a margem de ¥5', () => {
    // 500 * 0.0345 * 1.04 = 17.94
    expect(discountYenToDisplay(500, 'BRL', OPEN)).toBe(18);
    expect(discountYenToDisplay(500, 'JPY', OPEN)).toBe(500);
    expect(discountYenToDisplay(0, 'BRL', OPEN)).toBe(0);
  });
});

describe('couponTerms', () => {
  it('cupom fixo é em ienes e não vira percentual', () => {
    expect(couponTerms({ discountType: 'fixed', discount: 300 })).toMatchObject({ fixed: true, fixedYen: 300, percent: 0 });
    expect(couponTerms({ type: 'fixed', discount: 300 })).toMatchObject({ fixed: true, fixedYen: 300 });
  });

  it('percentual vem de discountPercent ou de discount, limitado a 0–100', () => {
    expect(couponTerms({ discount: 10 }).percent).toBe(10);
    expect(couponTerms({ discount: 0, discountPercent: 30 }).percent).toBe(30);
    expect(couponTerms({ discount: 250 }).percent).toBe(100);
    expect(couponTerms({ discount: -5 }).percent).toBe(0);
  });

  it('freeShipping antigo é ignorado: não existe frete grátis', () => {
    expect(couponTerms({ freeShipping: true, code: 'FS' })).toMatchObject({ percent: 0, fixedYen: 0 });
  });

  it('sem cupom devolve null', () => {
    expect(couponTerms(null)).toBeNull();
  });
});

describe('productBenefits', () => {
  it('cupom percentual só incide sobre a base regular (sem promoção da home e sem brinde)', () => {
    const lines = [line(1000, 2), line(500, 1, { homePromo: true }), line(0, 1, { freeGift: true })];
    const b = productBenefits({ lines, coupon: { discount: 10 } });
    expect(b.productSubtotalYen).toBe(2500);
    expect(b.regularSubtotalYen).toBe(2000);
    expect(b.couponDiscountYen).toBe(200);
  });

  it('cupom fixo não passa da base regular', () => {
    const b = productBenefits({ lines: [line(200)], coupon: { discountType: 'fixed', discount: 900 } });
    expect(b.couponDiscountYen).toBe(200);
  });

  it('cupom de afiliado não empilha em produto que já tem desconto', () => {
    const lines = [line(1000, 1, { productDiscounted: true }), line(1000, 1)];
    const comum = productBenefits({ lines, coupon: { discount: 10 } });
    const afiliado = productBenefits({ lines, coupon: { discount: 10, affiliateCode: 'ANA' } });
    expect(comum.couponDiscountYen).toBe(200);
    expect(afiliado.couponDiscountYen).toBe(100);
  });

  it('pontos pagam só mercadoria e não passam do que sobra depois do cupom', () => {
    const b = productBenefits({ lines: [line(1000)], coupon: { discount: 10 }, redeemPoints: 5000 });
    expect(b.couponDiscountYen).toBe(100);
    expect(b.pointsDiscountYen).toBe(900);
    expect(b.netProductsYen).toBe(0);
    expect(b.pointsCoverAllProducts).toBe(true);
  });

  it('taxa PS: ¥1.000 por unidade, menos brinde e produto isento', () => {
    const b = productBenefits({ lines: [line(1000, 2), line(900, 3, { noPsFee: true }), line(0, 2, { freeGift: true })] });
    expect(b.psFeeYen).toBe(2000);
  });
});

describe('taxa PS: prioridades', () => {
  it('pontos que cobrem tudo > isenção > negociação', () => {
    expect(psFeeDiscountYen({ psFeeYen: 2000, pointsCoverAllProducts: true, psFeeWaived: true, negotiatedDiscountYen: 500 })).toBe(0);
    expect(psFeeDiscountYen({ psFeeYen: 2000, pointsCoverAllProducts: false, psFeeWaived: true, negotiatedDiscountYen: 500 })).toBe(2000);
    expect(psFeeDiscountYen({ psFeeYen: 2000, pointsCoverAllProducts: false, psFeeWaived: false, negotiatedDiscountYen: 500 })).toBe(500);
  });

  it('negociação nunca passa da taxa e nunca é negativa', () => {
    expect(psFeeDiscountYen({ psFeeYen: 1000, negotiatedDiscountYen: 5000 })).toBe(1000);
    expect(psFeeDiscountYen({ psFeeYen: 1000, negotiatedDiscountYen: -50 })).toBe(0);
    expect(psFeeDiscountYen({ psFeeYen: 0, psFeeWaived: true })).toBe(0);
  });

  it('desconto automático: ¥300 por unidade', () => {
    expect(autoApprovablePsDiscountYen(3)).toBe(900);
    expect(autoApprovablePsDiscountYen(0)).toBe(0);
    expect(autoApprovablePsDiscountYen(-2)).toBe(0);
  });
});

describe('imposto dos EUA e taxas do PIX', () => {
  it('EUA: 12,5% dos produtos + US$ 2,77, em dólar inteiro, só em USD', () => {
    expect(usImportDuty(57, 'USD')).toBe(10); // 7,125 + 2,77 = 9,895
    expect(usImportDuty(100, 'USD')).toBe(15); // 12,5 + 2,77 = 15,27
    expect(usImportDuty(57, 'EUR')).toBe(0);
    expect(usImportDuty(0, 'USD')).toBe(0);
  });

  it('PIX: IOF de 3,5% + R$ 32, só em BRL', () => {
    expect(pixFees(418, 'BRL')).toEqual({ iof: 15, bankFee: PIX_BANK_FEE_BRL, total: 47 });
    expect(pixFees(418, 'EUR')).toEqual({ iof: 0, bankFee: 0, total: 0 });
    expect(pixFees(0, 'BRL')).toEqual({ iof: 0, bankFee: 0, total: 0 });
  });
});

describe('displayTotals: o total é a soma das linhas', () => {
  it('BRL cartão: sem desconto de 5% e sem taxa de pagamento', () => {
    const { shown } = totals({ lines: [line(8150)], shippingYen: 2500 });
    expect(shown).toMatchObject({ subtotal: 293, products: 293, shipping: 90, psFee: 35, importDuty: 0, paymentFee: 0, total: 418 });
  });

  it('BRL PIX: soma IOF e R$ 32 sobre o total antes das taxas', () => {
    const { shown } = totals({ lines: [line(8150)], shippingYen: 2500, paymentMethod: 'pix' });
    expect(shown).toMatchObject({ beforePaymentFee: 418, pixIof: 15, pixBankFee: 32, paymentFee: 47, total: 465 });
  });

  it('PIX fora do BRL não tem taxa', () => {
    const { shown } = totals({ lines: [line(8150)], shippingYen: 2500, paymentMethod: 'pix', currency: 'EUR', country: 'Portugal' });
    expect(shown.paymentFee).toBe(0);
  });

  it('EUA: imposto pré-pago entra no total; outros países não pagam', () => {
    const us = totals({ lines: [line(8150)], shippingYen: 2500, currency: 'USD', country: 'Estados Unidos' }).shown;
    expect(us).toMatchObject({ products: 57, shipping: 17, psFee: 7, importDuty: 10, total: 91 });
    const ca = totals({ lines: [line(8150)], shippingYen: 2500, currency: 'USD', country: 'Canadá' }).shown;
    expect(ca.importDuty).toBe(0);
  });

  it('JPY: tudo em ienes, sem cushion', () => {
    const { shown } = totals({ lines: [line(1480, 2)], shippingYen: 870, currency: 'JPY', country: 'Japão' });
    expect(shown).toMatchObject({ subtotal: 2960, shipping: 870, psFee: 2000, total: 5830 });
  });

  it('cupom percentual: arredonda sobre a base na moeda do cliente', () => {
    const { shown } = totals({ lines: [line(2000, 2)], coupon: { discount: 10 } });
    expect(shown.subtotal - shown.couponDiscount - shown.pointsDiscount).toBe(shown.products);
    expect(shown.couponDiscount).toBe(Math.round(shown.subtotal * 0.1));
  });

  it('cupom fixo em ienes: converte sem a margem de ¥5', () => {
    const { shown } = totals({ lines: [line(2000, 2)], coupon: { discountType: 'fixed', discount: 500 } });
    expect(shown.couponDiscount).toBe(discountYenToDisplay(500, 'BRL', OPEN));
  });

  it('pontos que cobrem tudo zeram a mercadoria sem sobra de arredondamento', () => {
    const { shown, benefits } = totals({ lines: [line(1000)], redeemPoints: 1000 });
    expect(benefits.pointsCoverAllProducts).toBe(true);
    expect(shown.products).toBe(0);
    expect(shown.psFee).toBe(35);
    expect(shown.total).toBe(shown.shipping + shown.psFee);
  });

  it('brinde não cobra nem entra na base do cupom; promoção da home também fica fora', () => {
    const lines = [line(1000), line(0, 1, { freeGift: true }), line(800, 1, { homePromo: true })];
    const { shown, benefits } = totals({ lines, coupon: { discount: 50 } });
    expect(benefits.productSubtotalYen).toBe(1800);
    expect(benefits.couponDiscountYen).toBe(500);
    expect(shown.units[1]).toBe(0);
    expect(shown.couponDiscount).toBe(Math.round(shown.units[0] * 0.5));
  });

  it('cartão e PIX têm o mesmo total antes das taxas', () => {
    const a = totals({ lines: [line(3000, 2)], shippingYen: 1200, paymentMethod: 'card' }).shown;
    const b = totals({ lines: [line(3000, 2)], shippingYen: 1200, paymentMethod: 'pix' }).shown;
    expect(b.beforePaymentFee).toBe(a.total);
    expect(b.total).toBe(a.total + b.paymentFee);
  });
});

describe('paymentMethodsForCountry', () => {
  it('Japão: só cartão', () => {
    expect(paymentMethodsForCountry('Japão')).toEqual(['card']);
  });

  it('Brasil: PIX e cartão', () => {
    expect(paymentMethodsForCountry('Brasil')).toEqual(['pix', 'card']);
  });

  it('demais países: só cartão', () => {
    for (const country of ['Portugal', 'Estados Unidos', 'Canadá', 'Argentina', 'País que não existe', undefined]) {
      expect(paymentMethodsForCountry(country)).toEqual(['card']);
    }
  });
});
