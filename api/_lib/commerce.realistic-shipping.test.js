// Carrinho com frete realista, pela rota do servidor (`buildQuote`, a mesma conta
// de `api/orders.js`), sem depender do EMS de ¥4.500+: e-Packet Light e Air
// Parcel têm tarifas bem menores. Para cada caso conferimos que
//   1. total = soma exata das linhas exibidas;
//   2. o frete convertido é o de `yenToDisplay` (função compartilhada);
//   3. o frete em ¥ do cliente (`quoteShipping`) é o do servidor; e
//   4. o total do cliente (`clientCheckoutTotals`) é igual ao do servidor.
//
// Regras do servidor para o peso (já embalado = peso conferido + 100 g de caixa):
// e-Packet Light só até 2 kg; Air Parcel só acima de 2 kg.
import { describe, expect, it } from 'vitest';
import { buildQuote } from './commerce.js';
import { yenToDisplay } from '../../shared/money.js';
import { clientCheckoutTotals, checkoutLineFromItem } from '../../src/utils/checkoutTotals';
import { quoteShipping } from '../../src/utils/shippingQuote';

const RATES = { BRL: 0.0345, EUR: 0.0061, USD: 0.0067, source: 'open-er' };

function produto(weightGrams) {
  return {
    id: 'p1',
    name: 'Produto',
    image: '',
    thumbnail: '',
    category: 'x',
    description: '',
    prices: { small: 1480, large: 2980 },
    weightGrams,
    weightVerified: true,
    discountPercent: 0,
    stock: { unlimited: true },
  };
}

function servidor({ product, country, carrier, paymentMethod, quantity = 1 }) {
  return buildQuote({
    requestedItems: [{ productId: 'p1', variantId: 'small', quantity }],
    products: new Map([['p1', product]]),
    country,
    prefecture: '',
    state: country === 'Brasil' ? 'SP' : '',
    carrier,
    paymentMethod,
    coupon: null,
    redeemPoints: 0,
    negotiation: null,
    campaign: null,
    homePromotion: null,
    rates: RATES,
  });
}

const MOEDA = { Brasil: 'BRL', 'Estados Unidos': 'USD' };

const CASOS = [
  { nome: 'Brasil, e-Packet Light, 300 g, cartão', country: 'Brasil', carrier: 'eraito', weightG: 300, paymentMethod: 'card' },
  { nome: 'Brasil, e-Packet Light, 300 g, PIX', country: 'Brasil', carrier: 'eraito', weightG: 300, paymentMethod: 'pix' },
  { nome: 'Brasil, e-Packet Light, 1 kg, cartão', country: 'Brasil', carrier: 'eraito', weightG: 1000, paymentMethod: 'card' },
  { nome: 'Brasil, e-Packet Light, 1 kg, PIX', country: 'Brasil', carrier: 'eraito', weightG: 1000, paymentMethod: 'pix' },
  { nome: 'Brasil, e-Packet Light, 3 x 300 g (900 g + caixa), cartão', country: 'Brasil', carrier: 'eraito', weightG: 300, quantity: 3, paymentMethod: 'card' },
  { nome: 'Brasil, Air Parcel, 2 kg, cartão', country: 'Brasil', carrier: 'kozutsumi-air', weightG: 2000, paymentMethod: 'card' },
  { nome: 'Brasil, Air Parcel, 2 kg, PIX', country: 'Brasil', carrier: 'kozutsumi-air', weightG: 2000, paymentMethod: 'pix' },
  { nome: 'Brasil, Air Parcel, 2 x 1 kg (2 kg + caixa), PIX', country: 'Brasil', carrier: 'kozutsumi-air', weightG: 1000, quantity: 2, paymentMethod: 'pix' },
  { nome: 'Brasil, EMS, 300 g, cartão', country: 'Brasil', carrier: 'ems', weightG: 300, paymentMethod: 'card' },
  { nome: 'Brasil, EMS, 1 kg, PIX', country: 'Brasil', carrier: 'ems', weightG: 1000, paymentMethod: 'pix' },
  { nome: 'EUA, EMS (DDP), 300 g, cartão', country: 'Estados Unidos', carrier: 'ems', weightG: 300, paymentMethod: 'card' },
  { nome: 'EUA, EMS (DDP), 1 kg, cartão', country: 'Estados Unidos', carrier: 'ems', weightG: 1000, paymentMethod: 'card' },
  { nome: 'EUA, EMS (DDP), 2 kg, cartão', country: 'Estados Unidos', carrier: 'ems', weightG: 2000, paymentMethod: 'card' },
];

describe('frete realista pela rota do servidor (buildQuote)', () => {
  it.each(CASOS)('$nome', ({ country, carrier, weightG, quantity = 1, paymentMethod }) => {
    const product = produto(weightG);
    const quote = servidor({ product, country, carrier, paymentMethod, quantity });
    const currency = MOEDA[country];
    expect(quote.currency).toBe(currency);

    // 1. total = soma exata das linhas, todas inteiras ou com centavos exatos (USD).
    const d = quote.display;
    const soma = d.products + d.shipping + d.psFee + d.importDuty + d.paymentFee;
    expect(quote.total).toBeCloseTo(soma, 10);
    expect(d.subtotal - d.couponDiscount - d.pointsDiscount).toBeCloseTo(d.products, 10);
    if (paymentMethod === 'pix') expect(d.paymentFee).toBeGreaterThan(0);
    else expect(d.paymentFee).toBe(0);

    // 2. frete convertido = função compartilhada.
    expect(quote.shippingYen).toBeGreaterThan(0);
    expect(d.shipping).toBe(yenToDisplay(quote.shippingYen, currency, RATES));

    // 3. frete em ¥ do cliente = o do servidor (mesmo peso embalado, mesma tarifa).
    const item = { product, quantity, size: 'small' };
    const cliente = quoteShipping([item], country);
    expect(cliente.boxes.totalWeightG).toBe(quote.shippingWeightG);
    const opcao = cliente.options.find((o) => o.carrier === carrier);
    expect(opcao?.costYen).toBe(quote.shippingYen);

    // 4. total do cliente = total do servidor, com os mesmos dados.
    const totais = clientCheckoutTotals({
      lines: [checkoutLineFromItem(item)],
      coupon: null,
      redeemPoints: 0,
      paymentMethod,
      currency,
      country,
      rates: RATES,
      finalShippingYen: opcao.costYen,
    });
    expect(totais.total).toBe(quote.total);
    expect(totais.display.shipping).toBe(d.shipping);
    expect(totais.display.products).toBe(d.products);
    expect(totais.display.psFee).toBe(d.psFee);
    expect(totais.display.importDuty).toBe(d.importDuty);
    expect(totais.display.paymentFee).toBe(d.paymentFee);
  });

  it('tarifas realistas: e-Packet Light e Air Parcel ficam abaixo do EMS de ¥4.500 em R$', () => {
    const leve = servidor({ product: produto(300), country: 'Brasil', carrier: 'eraito', paymentMethod: 'card' });
    const ems = servidor({ product: produto(2000), country: 'Brasil', carrier: 'ems', paymentMethod: 'card' });
    expect(leve.shippingYen).toBeLessThan(4500);
    expect(leve.shippingYen).toBeLessThan(ems.shippingYen);
  });

  it('o serviço fora da faixa de peso é recusado pelo servidor e não é oferecido ao cliente', () => {
    // Air Parcel só acima de 2 kg embalado.
    expect(() => servidor({ product: produto(300), country: 'Brasil', carrier: 'kozutsumi-air', paymentMethod: 'card' }))
      .toThrowError('invalid_shipping');
    expect(() => servidor({ product: produto(1000), country: 'Brasil', carrier: 'kozutsumi-air', paymentMethod: 'card' }))
      .toThrowError('invalid_shipping');
    // e-Packet Light só até 2 kg embalado (2 kg + 100 g de caixa já passa).
    expect(() => servidor({ product: produto(2000), country: 'Brasil', carrier: 'eraito', paymentMethod: 'card' }))
      .toThrowError('invalid_shipping');

    const leve = quoteShipping([{ product: produto(300), quantity: 1, size: 'small' }], 'Brasil');
    expect(leve.options.find((o) => o.carrier === 'kozutsumi-air')).toBeUndefined();
    const pesado = quoteShipping([{ product: produto(2000), quantity: 1, size: 'small' }], 'Brasil');
    expect(pesado.options.find((o) => o.carrier === 'eraito')).toBeUndefined();
  });

  it('EUA só aceita EMS (DDP)', () => {
    expect(() => servidor({ product: produto(300), country: 'Estados Unidos', carrier: 'eraito', paymentMethod: 'card' }))
      .toThrowError('shipping_unavailable');
  });
});
