// O total que o cliente mostra (carrinho/checkout/revisão) tem de ser o total que o
// servidor cobra. Os dois lados usam shared/checkout-totals.js; aqui a comparação
// mostra que os dados da tela chegam ao mesmo resultado que o servidor.
//
// O frete entra com o valor que o servidor calculou (`quote.shippingYen`): este
// teste cobre a CONTA, não as tabelas de frete (essas ficam fora, ver o relatório).
import { describe, expect, it } from 'vitest';
import { buildQuote } from '../../api/_lib/commerce.js';
import { clientCheckoutTotals, checkoutLineFromItem, type CheckoutLine } from './checkoutTotals';
import type { Product } from '@/types';

type Rates = { BRL: number; EUR: number; USD: number; source: string };
const RATES: Record<string, Rates> = {
  // cotação de origem aberta (cushion 4%)
  open: { BRL: 0.0345, EUR: 0.0061, USD: 0.0067, source: 'open-er' },
  // fallback fixo do servidor (mesmos valores do cliente)
  fallback: { BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150, source: 'fallback' },
  // Wise (cushion 0)
  wise: { BRL: 0.0331, EUR: 0.0059, USD: 0.0064, source: 'wise' },
};

const COUNTRY_CURRENCY: Record<string, string> = {
  'Brasil': 'BRL', 'Portugal': 'EUR', 'Estados Unidos': 'USD', 'Japão': 'JPY',
};

function product(id: string, small: number, large: number, extra: Record<string, unknown> = {}) {
  return {
    id, name: `Produto ${id}`, image: '', thumbnail: '', category: 'x', description: '',
    prices: { small, large }, weightGrams: 280, discountPercent: 0,
    stock: { unlimited: true }, ...extra,
  };
}

const PRODUCTS = new Map<string, Record<string, unknown>>([
  ['a', product('a', 1480, 2980)],
  ['b', product('b', 2200, 4500, { discountPercent: 15 })],
  ['c', product('c', 990, 1890, { noPsFee: true })],
  ['promo', product('promo', 3000, 6000)],
]);

interface Case {
  name: string;
  country: string;
  paymentMethod: string;
  items: { productId: string; size: string; quantity: number; promo?: boolean }[];
  coupon?: Record<string, unknown> | null;
  redeemPoints?: number;
  rates: keyof typeof RATES;
  homePromo?: boolean;
  psFeeWaived?: boolean;
  negotiation?: Record<string, unknown> | null;
  prefecture?: string;
  carrier?: string;
}

const CASES: Case[] = [
  { name: 'um só produto, BRL, sem cupom', country: 'Brasil', paymentMethod: 'wise', items: [{ productId: 'a', size: 'small', quantity: 1 }], rates: 'open' },
  { name: 'vários produtos, EUR, com frete', country: 'Portugal', paymentMethod: 'card', items: [{ productId: 'a', size: 'large', quantity: 2 }, { productId: 'b', size: 'small', quantity: 3 }], rates: 'open' },
  { name: 'USD com pontos', country: 'Estados Unidos', paymentMethod: 'wise', items: [{ productId: 'b', size: 'large', quantity: 1 }, { productId: 'c', size: 'small', quantity: 2 }], redeemPoints: 500, rates: 'fallback', prefecture: 'CA' },
  { name: 'JPY com cupom fixo', country: 'Japão', paymentMethod: 'wise', items: [{ productId: 'a', size: 'small', quantity: 4 }], coupon: { discount: 300, discountType: 'fixed', code: 'F300' }, rates: 'open', prefecture: 'Mie', carrier: 'yamato' },
  { name: 'BRL com cupom percentual e cartão (5%)', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'b', size: 'small', quantity: 2 }, { productId: 'a', size: 'large', quantity: 1 }], coupon: { discountPercent: 10, code: 'P10' }, rates: 'open' },
  { name: 'BRL com PIX, pontos e cupom', country: 'Brasil', paymentMethod: 'pix', items: [{ productId: 'a', size: 'large', quantity: 3 }], coupon: { discountPercent: 10, code: 'P10' }, redeemPoints: 800, rates: 'open' },
  { name: 'BRL com cupom de frete grátis', country: 'Brasil', paymentMethod: 'wise', items: [{ productId: 'a', size: 'small', quantity: 2 }], coupon: { freeShipping: true, code: 'FS' }, rates: 'wise' },
  { name: 'JPY com promoção da home e produto comum', country: 'Japão', paymentMethod: 'wise', items: [{ productId: 'promo', size: 'small', quantity: 1, promo: true }, { productId: 'a', size: 'small', quantity: 1 }], homePromo: true, rates: 'open', prefecture: 'Mie', carrier: 'yuubin' },
  { name: 'USD com PS isento e taxa PS negociada', country: 'Estados Unidos', paymentMethod: 'wise', items: [{ productId: 'c', size: 'small', quantity: 1 }, { productId: 'a', size: 'small', quantity: 2 }], negotiation: { status: 'approved', approvedBy: 'admin', type: 'ps_fee', approvedDiscountYen: 400 }, rates: 'fallback', prefecture: 'NY' },
  { name: 'EUR com taxa PS isenta (oferta de saída)', country: 'Portugal', paymentMethod: 'card', items: [{ productId: 'a', size: 'small', quantity: 2 }], psFeeWaived: true, rates: 'wise' },
  { name: 'BRL com desconto de frete negociado', country: 'Brasil', paymentMethod: 'wise', items: [{ productId: 'b', size: 'large', quantity: 1 }], negotiation: { status: 'approved', approvedBy: 'admin', type: 'shipping', approvedDiscountYen: 200 }, rates: 'open' },
];

function serverQuote(c: Case) {
  const requestedItems = c.items.map((i) => ({
    productId: i.promo ? 'promo_promo' : i.productId,
    variantId: i.size,
    quantity: i.quantity,
  }));
  const homePromotion = c.homePromo
    ? { productId: 'promo', promoPriceYen: 2400, limitPerPerson: 2, maxProducts: null, soldCount: 0, reservedCount: 0, expiresAt: null }
    : null;
  return buildQuote({
    requestedItems,
    products: PRODUCTS,
    country: c.country,
    prefecture: c.prefecture ?? '',
    state: '',
    carrier: c.carrier ?? (c.country === 'Japão' ? 'yuubin' : 'ems'),
    paymentMethod: c.paymentMethod,
    coupon: c.coupon ?? null,
    redeemPoints: c.redeemPoints ?? 0,
    negotiation: c.negotiation ?? null,
    campaign: null,
    homePromotion,
    rates: RATES[c.rates],
    recentSpendYen: 0,
    psFeeWaived: c.psFeeWaived ?? false,
  });
}

function clientLines(c: Case): CheckoutLine[] {
  return c.items.map((i) => {
    const base = PRODUCTS.get(i.productId)!;
    // Item de promoção da home: o carrinho guarda um produto `_promo` com o preço da promoção.
    const p = i.promo
      ? { ...base, id: 'promo_promo', prices: { small: 2400, large: 2400 }, discountPercent: 0 }
      : base;
    return checkoutLineFromItem({
      product: p as unknown as Product,
      size: i.size,
      quantity: i.quantity,
    });
  });
}

describe('total do cliente = total do servidor', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const quote = serverQuote(c);
      const currency = COUNTRY_CURRENCY[c.country];
      expect(quote.currency).toBe(currency);

      const client = clientCheckoutTotals({
        lines: clientLines(c),
        coupon: (c.coupon ?? null) as never,
        redeemPoints: c.redeemPoints ?? 0,
        paymentMethod: c.paymentMethod,
        currency,
        rates: RATES[c.rates],
        // O frete vem do servidor nesta comparação (ver nota no topo).
        finalShippingYen: quote.shippingYen,
        psFeeWaived: c.psFeeWaived ?? false,
        negotiatedPsDiscountYen: c.negotiation?.type === 'ps_fee' ? Number(c.negotiation.approvedDiscountYen) : 0,
      });

      // Total cobrado e parcelas da conta, na moeda do cliente.
      expect(client.total).toBe(quote.total);
      expect(client.display.products).toBe(quote.display.products);
      expect(client.display.shipping).toBe(quote.display.shipping);
      expect(client.display.psFee).toBe(quote.display.psFee);
      expect(client.display.couponDiscount).toBe(quote.display.couponDiscount);
      expect(client.display.pointsDiscount).toBe(quote.display.pointsDiscount);
      expect(client.display.paymentDiscount).toBe(quote.display.paymentDiscount);
      expect(client.display.subtotal).toBe(quote.display.subtotal);
      // Em ¥: mesmas parcelas que o servidor usa para o pagamento.
      expect(client.netProductsYen).toBe(quote.netProductsYen);
      expect(client.couponDiscountYen).toBe(quote.couponDiscountYen);
      expect(client.pointsDiscountYen).toBe(quote.pointsDiscountYen);
      expect(client.psFeeYenCharged).toBe(quote.psFeeYen);
      // A conta fecha: subtotal − descontos = produtos; produtos + frete + taxa PS = total.
      expect(client.display.subtotal - client.display.couponDiscount - client.display.pointsDiscount - client.display.paymentDiscount).toBeCloseTo(client.display.products, 2);
      expect(client.display.products + client.display.shipping + client.display.psFee).toBeCloseTo(client.total, 2);
    });
  }

  it('preço unitário do cliente = preço unitário do servidor (com desconto do produto)', () => {
    const quote = serverQuote({ ...CASES[0], items: [{ productId: 'b', size: 'small', quantity: 1 }] });
    const line = clientLines({ ...CASES[0], items: [{ productId: 'b', size: 'small', quantity: 1 }] })[0];
    expect(line.unitYen).toBe(quote.items[0].unitYen);
  });
});
