// O total que o cliente mostra (carrinho/checkout/revisão) tem de ser o total que o
// servidor cobra. Os dois lados usam shared/money.js; aqui a comparação mostra que
// os dados da tela chegam ao mesmo resultado que o servidor, linha por linha.
//
// O frete entra com o valor que o servidor calculou (`quote.shippingYen`): este
// teste cobre a CONTA, não as tabelas de frete (essas ficam fora, ver o relatório).
import { describe, expect, it } from 'vitest';
import { buildQuote } from '../../api/_lib/commerce.js';
import { currencyForCountry } from '../../api/_lib/fx.js';
import { getCurrencyByCountry } from './currency';
import { WORLD_COUNTRIES } from '@/data/worldCountries';
import { clientCheckoutTotals, checkoutLineFromItem, couponYenFor, type CheckoutLine } from './checkoutTotals';
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
  ['d', product('d', 8150, 8150)],
  ['promo', product('promo', 3000, 6000)],
]);

interface Case {
  name: string;
  country: string;
  paymentMethod: 'card' | 'pix';
  items: { productId: string; size: string; quantity: number; promo?: boolean }[];
  coupon?: Record<string, unknown> | null;
  redeemPoints?: number;
  rates: keyof typeof RATES;
  homePromo?: boolean;
  /** Campanha "compre e leve": o servidor monta o brinde e o cliente o recebe como linha grátis. */
  gift?: { productId: string; quantity: number };
  psFeeWaived?: boolean;
  negotiation?: Record<string, unknown> | null;
  prefecture?: string;
  carrier?: string;
}

const CASES: Case[] = [
  // 1. um produto
  { name: 'um só produto, BRL cartão', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'a', size: 'small', quantity: 1 }], rates: 'open' },
  // 2. vários produtos
  { name: 'vários produtos, EUR cartão, com frete', country: 'Portugal', paymentMethod: 'card', items: [{ productId: 'a', size: 'large', quantity: 2 }, { productId: 'b', size: 'small', quantity: 3 }], rates: 'open' },
  // 3. BRL cartão (sem desconto de 5%)
  { name: 'BRL cartão com ¥8.150: sem desconto de 5%', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'd', size: 'small', quantity: 1 }], rates: 'open' },
  // 4. BRL PIX com IOF e R$ 32
  { name: 'BRL PIX com ¥8.150: IOF 3,5% e tarifa de R$ 32', country: 'Brasil', paymentMethod: 'pix', items: [{ productId: 'd', size: 'small', quantity: 1 }], rates: 'open' },
  // 5. EUR
  { name: 'EUR cartão, cotação da Wise (cushion 0)', country: 'Portugal', paymentMethod: 'card', items: [{ productId: 'a', size: 'small', quantity: 4 }], rates: 'wise' },
  // 6. USD EUA com imposto
  { name: 'USD EUA cartão: imposto de importação pré-pago', country: 'Estados Unidos', paymentMethod: 'card', items: [{ productId: 'd', size: 'small', quantity: 1 }, { productId: 'a', size: 'small', quantity: 2 }], rates: 'open', prefecture: 'CA' },
  // 7. JPY
  { name: 'JPY cartão (Mie, Yamato)', country: 'Japão', paymentMethod: 'card', items: [{ productId: 'a', size: 'small', quantity: 4 }], rates: 'open', prefecture: 'Mie', carrier: 'yamato' },
  // 8. cupom percentual
  { name: 'BRL cupom percentual de 10% e cartão', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'b', size: 'small', quantity: 2 }, { productId: 'a', size: 'large', quantity: 1 }], coupon: { discountPercent: 10, code: 'P10' }, rates: 'open' },
  // 9. cupom fixo (em ienes)
  { name: 'JPY cupom fixo de ¥300', country: 'Japão', paymentMethod: 'card', items: [{ productId: 'a', size: 'small', quantity: 4 }], coupon: { discount: 300, discountType: 'fixed', code: 'F300' }, rates: 'open', prefecture: 'Mie', carrier: 'yamato' },
  { name: 'BRL cupom fixo de ¥500 convertido sem a margem de ¥5', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'a', size: 'large', quantity: 2 }], coupon: { discount: 500, discountType: 'fixed', code: 'F500' }, rates: 'open' },
  // 10. pontos
  { name: 'USD com pontos', country: 'Estados Unidos', paymentMethod: 'card', items: [{ productId: 'b', size: 'large', quantity: 1 }, { productId: 'c', size: 'small', quantity: 2 }], redeemPoints: 500, rates: 'fallback', prefecture: 'CA' },
  { name: 'BRL PIX com pontos e cupom', country: 'Brasil', paymentMethod: 'pix', items: [{ productId: 'a', size: 'large', quantity: 3 }], coupon: { discountPercent: 10, code: 'P10' }, redeemPoints: 800, rates: 'open' },
  { name: 'BRL pontos cobrindo todos os produtos: taxa PS volta cheia', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'a', size: 'small', quantity: 1 }], redeemPoints: 99999, psFeeWaived: true, rates: 'open' },
  // 11. taxa PS isenta
  { name: 'EUR com taxa PS isenta (oferta de saída)', country: 'Portugal', paymentMethod: 'card', items: [{ productId: 'a', size: 'small', quantity: 2 }], psFeeWaived: true, rates: 'wise' },
  // 12. negociação
  { name: 'USD com PS isento (produto) e taxa PS negociada', country: 'Estados Unidos', paymentMethod: 'card', items: [{ productId: 'c', size: 'small', quantity: 1 }, { productId: 'a', size: 'small', quantity: 2 }], negotiation: { status: 'approved', approvedBy: 'admin', type: 'ps_fee', approvedDiscountYen: 400 }, rates: 'fallback', prefecture: 'NY' },
  { name: 'BRL com desconto de frete negociado', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'b', size: 'large', quantity: 1 }], negotiation: { status: 'approved', approvedBy: 'admin', type: 'shipping', approvedDiscountYen: 200 }, rates: 'open' },
  // 13. brinde
  { name: 'BRL com brinde da campanha (grátis, fora do cupom e da taxa PS)', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'a', size: 'small', quantity: 2 }], gift: { productId: 'c', quantity: 2 }, coupon: { discountPercent: 10, code: 'P10' }, rates: 'open' },
  // 14. promoção da home
  { name: 'JPY com promoção da home e produto comum', country: 'Japão', paymentMethod: 'card', items: [{ productId: 'promo', size: 'small', quantity: 1, promo: true }, { productId: 'a', size: 'small', quantity: 1 }], homePromo: true, coupon: { discountPercent: 20, code: 'P20' }, rates: 'open', prefecture: 'Mie', carrier: 'yuubin' },
  { name: 'BRL PIX com promoção da home, cupom e brinde', country: 'Brasil', paymentMethod: 'pix', items: [{ productId: 'promo', size: 'small', quantity: 1, promo: true }, { productId: 'a', size: 'large', quantity: 1 }], homePromo: true, gift: { productId: 'c', quantity: 1 }, coupon: { discountPercent: 15, code: 'P15' }, rates: 'fallback' },
  // cupom antigo
  { name: 'BRL com cupom antigo com freeShipping (campo ignorado)', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'a', size: 'small', quantity: 2 }], coupon: { freeShipping: true, code: 'FS' }, rates: 'wise' },
  // afiliado
  { name: 'BRL com cupom de afiliado: não empilha no produto com desconto', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'b', size: 'small', quantity: 1 }, { productId: 'a', size: 'small', quantity: 1 }], coupon: { discount: 10, discountType: 'percentage', affiliateCode: 'ANA', code: 'ANA' }, rates: 'open' },
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
  // A campanha "compre X, leve Y": o servidor reconstrói o brinde a partir do produto-gatilho.
  const campaign = c.gift
    ? { mechanic: 'bogo_other', productId: c.items[0].productId, giftProductId: c.gift.productId, keepProductDiscount: true }
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
    campaign,
    homePromotion,
    rates: RATES[c.rates],
    recentSpendYen: 0,
    psFeeWaived: c.psFeeWaived ?? false,
  });
}

function clientLines(c: Case): CheckoutLine[] {
  const lines = c.items.map((i) => {
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
  if (c.gift) {
    lines.push(checkoutLineFromItem({
      product: PRODUCTS.get(c.gift.productId) as unknown as Product,
      size: 'small',
      quantity: c.gift.quantity,
      freeGift: true,
    }));
  }
  return lines;
}

function clientTotals(c: Case, shippingYen: number) {
  const currency = COUNTRY_CURRENCY[c.country];
  return clientCheckoutTotals({
    lines: clientLines(c),
    coupon: (c.coupon ?? null) as never,
    redeemPoints: c.redeemPoints ?? 0,
    paymentMethod: c.paymentMethod,
    currency,
    country: c.country,
    rates: RATES[c.rates],
    // O frete vem do servidor nesta comparação (ver nota no topo).
    finalShippingYen: shippingYen,
    psFeeWaived: c.psFeeWaived ?? false,
    negotiatedPsDiscountYen: c.negotiation?.type === 'ps_fee' ? Number(c.negotiation.approvedDiscountYen) : 0,
  });
}

describe('total do cliente = total do servidor', () => {
  it('cobre pelo menos 14 casos', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(14);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const quote = serverQuote(c);
      expect(quote.currency).toBe(COUNTRY_CURRENCY[c.country]);
      const client = clientTotals(c, quote.shippingYen);

      // Total cobrado e todas as linhas da conta, na moeda do cliente.
      expect(client.total).toBe(quote.total);
      expect(client.display.subtotal).toBe(quote.display.subtotal);
      expect(client.display.couponDiscount).toBe(quote.display.couponDiscount);
      expect(client.display.pointsDiscount).toBe(quote.display.pointsDiscount);
      expect(client.display.products).toBe(quote.display.products);
      expect(client.display.shipping).toBe(quote.display.shipping);
      expect(client.display.psFee).toBe(quote.display.psFee);
      expect(client.display.importDuty).toBe(quote.display.importDuty);
      expect(client.display.paymentFee).toBe(quote.display.paymentFee);
      expect(client.display.pixIof).toBe(quote.display.pixIof);
      expect(client.display.pixBankFee).toBe(quote.display.pixBankFee);
      // Em ¥: mesmas parcelas que o servidor usa para o pagamento.
      expect(client.netProductsYen).toBe(quote.netProductsYen);
      expect(client.couponDiscountYen).toBe(quote.couponDiscountYen);
      expect(client.pointsDiscountYen).toBe(quote.pointsDiscountYen);
      expect(client.psFeeYenCharged).toBe(quote.psFeeYen);
      // Preço unitário da vitrine = preço unitário do pedido.
      expect(client.shown.units).toEqual(quote.items.map((item: { price: number }) => item.price));

      // A conta fecha, com inteiros: subtotal − descontos = produtos; produtos + frete + taxa PS + imposto + taxa PIX = total.
      const d = quote.display;
      expect(Number.isInteger(quote.total)).toBe(true);
      expect(d.subtotal - d.couponDiscount - d.pointsDiscount).toBe(d.products);
      expect(d.products + d.shipping + d.psFee + d.importDuty + d.paymentFee).toBe(quote.total);
      expect(d.paymentDiscount).toBe(0);
    });
  }

  it('cartão e PIX: só o PIX em BRL soma IOF e R$ 32', () => {
    const base: Case = { name: '', country: 'Brasil', paymentMethod: 'card', items: [{ productId: 'd', size: 'small', quantity: 1 }], rates: 'open' };
    const card = serverQuote(base);
    const pix = serverQuote({ ...base, paymentMethod: 'pix' });
    expect(card.display.paymentFee).toBe(0);
    expect(pix.display.pixBankFee).toBe(32);
    expect(pix.display.pixIof).toBe(Math.round(card.total * 0.035));
    expect(pix.total).toBe(card.total + pix.display.pixIof + 32);
  });

  it('só os EUA pagam o imposto de importação pré-pago (12,5% + US$ 2,77)', () => {
    const us = serverQuote({ name: '', country: 'Estados Unidos', paymentMethod: 'card', items: [{ productId: 'd', size: 'small', quantity: 1 }], rates: 'open', prefecture: 'CA' });
    expect(us.display.importDuty).toBe(Math.round(us.display.products * 0.125 + 2.77));
    expect(us.display.importDuty).toBeGreaterThan(0);
    expect(us.tax).toBe(0);
    const pt = serverQuote({ name: '', country: 'Portugal', paymentMethod: 'card', items: [{ productId: 'd', size: 'small', quantity: 1 }], rates: 'open' });
    expect(pt.display.importDuty).toBe(0);
  });

  it('preço unitário do cliente = preço unitário do servidor (com desconto do produto)', () => {
    const c = { ...CASES[0], items: [{ productId: 'b', size: 'small', quantity: 1 }] };
    const quote = serverQuote(c);
    const line = clientLines(c)[0];
    expect(line.unitYen).toBe(quote.items[0].unitYen);
  });

  it('cupom antigo com freeShipping não dá desconto e não zera o frete', () => {
    // Dado antigo do Firestore: o campo não existe mais no tipo, mas pode estar gravado.
    const legacyCoupon = { freeShipping: true, code: 'FS' };
    const totals = clientCheckoutTotals({
      lines: [{ unitYen: 1000, quantity: 2 }],
      coupon: legacyCoupon,
      redeemPoints: 0,
      paymentMethod: 'card',
      currency: 'BRL',
      rates: { BRL: 0.03, EUR: 0.006, USD: 0.007, source: 'wise' },
      finalShippingYen: 800,
    });
    expect(totals.couponDiscountYen).toBe(0);
    expect(totals.finalShippingYen).toBe(800);
    expect(totals.display.shipping).toBeGreaterThan(0);
  });

  it('couponYenFor devolve o mesmo cupom em ¥ que o servidor', () => {
    const c = CASES.find((item) => item.name.startsWith('BRL cupom percentual'))!;
    const quote = serverQuote(c);
    expect(couponYenFor(clientLines(c), c.coupon as never)).toBe(quote.couponDiscountYen);
  });
});

describe('moeda por país: cliente = servidor', () => {
  it('todo país da loja tem a mesma moeda na tela e na cobrança', () => {
    const differences = WORLD_COUNTRIES
      .filter((country) => getCurrencyByCountry(country.name) !== currencyForCountry(country.name))
      .map((country) => `${country.name}: tela ${getCurrencyByCountry(country.name)} / servidor ${currencyForCountry(country.name)}`);
    expect(differences).toEqual([]);
  });
});
