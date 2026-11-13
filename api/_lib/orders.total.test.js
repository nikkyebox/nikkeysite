// O total gravado no pedido e o valor enviado ao Stripe vêm da MESMA conta
// (shared/money.js, via buildQuote): linhas inteiras na moeda do cliente, sem
// desconto escondido, com o imposto dos EUA e as taxas do PIX quando valem.
// O webhook confere o pagamento com `Math.round(totalPrice * 100)`, então o valor
// da cobrança tem de ser exatamente esse.
//
// Também cobre a regra de pagamento por país: PIX só no Brasil; o servidor recusa
// PIX no resto do mundo.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentMethodsForCountry } from '../../shared/money.js';

const injected = vi.hoisted(() => ({ db: null }));
const mocks = vi.hoisted(() => ({ verify: vi.fn(), limitar: vi.fn(), create: vi.fn() }));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.paymentIntents = { create: mocks.create, retrieve: vi.fn() };
    }
  },
}));

vi.mock('./fx.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getFxRates: async () => ({ BRL: 0.0345, EUR: 0.0061, USD: 0.0067, source: 'open-er' }),
}));

vi.mock('./mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendMail: vi.fn(),
}));

vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => ({ verifyIdToken: mocks.verify }),
  adminDb: () => injected.db,
}));

const { handleCreate } = await import('../orders.js');

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class FakeDb {
  constructor(initial) {
    this.docs = new Map(Object.entries(initial).map(([path, value]) => [path, clone(value)]));
  }

  collection(name) {
    const banco = this;
    return {
      doc: (id) => {
        const ref = { path: `${name}/${id}`, id: String(id) };
        ref.get = async () => banco.snapshot(ref);
        ref.set = async (value) => { banco.docs.set(ref.path, clone(value)); };
        ref.update = async (value) => { banco.docs.set(ref.path, { ...clone(banco.docs.get(ref.path)), ...clone(value) }); };
        return ref;
      },
    };
  }

  snapshot(ref, docs = this.docs) {
    const value = docs.get(ref.path);
    return { ref, id: ref.id, exists: value !== undefined, data: () => clone(value) };
  }

  async getAll(...refs) {
    return refs.map((ref) => this.snapshot(ref));
  }

  async runTransaction(callback) {
    const working = new Map([...this.docs].map(([path, value]) => [path, clone(value)]));
    const transaction = {
      get: async (ref) => this.snapshot(ref, working),
      create: (ref, value) => {
        if (working.has(ref.path)) throw new Error('already_exists');
        working.set(ref.path, clone(value));
      },
      set: (ref, value) => working.set(ref.path, clone(value)),
      update: (ref, value) => working.set(ref.path, { ...clone(working.get(ref.path)), ...clone(value) }),
      delete: (ref) => working.delete(ref.path),
    };
    const result = await callback(transaction);
    this.docs = working;
    return result;
  }

  get(path) {
    return clone(this.docs.get(path));
  }
}

function resposta() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; },
  };
}

let contador = 300000;
function pedido({ country = 'Brasil', paymentMethod = 'card', state = 'SP', carrier = 'ems', prefecture = '' } = {}) {
  contador += 1;
  return {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: {
      orderId: `SC-JP-${contador}`,
      items: [{ productId: 'p1', variantId: 'small', quantity: 1 }],
      country,
      prefecture,
      state,
      shippingCarrier: carrier,
      paymentMethod,
      couponCode: '',
      redeemPoints: 0,
      negotiationId: '',
      promoCode: '',
      customer: {
        name: 'Cliente Teste', email: 'cliente@exemplo.com', phone: '', cpf: country === 'Brasil' ? '39053344705' : '',
        postalCode: '01310-100', city: 'Sao Paulo', address: 'Av Paulista 1000', building: '',
      },
    },
  };
}

function banco() {
  return new FakeDb({
    'products/p1': { name: 'Produto', prices: { small: 8150 }, weightGrams: 500, stock: { unlimited: true } },
    'users/u1': { email: 'cliente@exemplo.com', points: 0 },
  });
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
  mocks.limitar.mockReset().mockResolvedValue(undefined);
  mocks.verify.mockReset().mockResolvedValue({ uid: 'u1', email: 'cliente@exemplo.com' });
  mocks.create.mockReset().mockImplementation(async (params) => ({ id: 'pi_1', client_secret: 'secret', ...params }));
  injected.db = banco();
});

async function criar(opcoes) {
  const req = pedido(opcoes);
  const res = resposta();
  await handleCreate(req, res);
  return { res, order: injected.db.get(`orders/${req.body.orderId}`) };
}

describe('create-order: total e valor da cobrança', () => {
  it('cartão em BRL: o Stripe recebe o total inteiro em centavos, sem desconto de 5%', async () => {
    const { res, order } = await criar({ paymentMethod: 'card' });
    expect(res.statusCode).toBe(201);
    expect(Number.isInteger(order.total)).toBe(true);
    expect(order.totalPrice).toBe(order.total);
    expect(order.totalAmount).toBe(order.total);
    expect(order.priceBreakdown.paymentDiscount).toBe(0);
    expect(order.priceBreakdown.paymentFee).toBe(0);
    const pb = order.priceBreakdown;
    expect(pb.products + pb.shipping + pb.psFee + pb.importDuty + pb.paymentFee).toBe(order.total);

    expect(mocks.create).toHaveBeenCalledTimes(1);
    const { amount, currency } = mocks.create.mock.calls[0][0];
    expect(currency).toBe('brl');
    expect(amount).toBe(order.total * 100);
    // É a mesma conta que o webhook faz para conferir o pagamento.
    expect(amount).toBe(Math.round(order.totalPrice * 100));
  });

  it('PIX em BRL: o total gravado inclui IOF de 3,5% e R$ 32, e não cria cobrança no Stripe', async () => {
    const card = await criar({ paymentMethod: 'card' });
    mocks.create.mockClear();
    const { res, order } = await criar({ paymentMethod: 'pix' });
    expect(res.statusCode).toBe(201);
    expect(mocks.create).not.toHaveBeenCalled();
    const pb = order.priceBreakdown;
    expect(pb.pixBankFee).toBe(32);
    expect(pb.pixIof).toBe(Math.round(card.order.total * 0.035));
    expect(pb.paymentFee).toBe(pb.pixIof + 32);
    expect(order.total).toBe(card.order.total + pb.paymentFee);
    expect(pb.products + pb.shipping + pb.psFee + pb.importDuty + pb.paymentFee).toBe(order.total);
  });

  it('EUA no cartão: o imposto pré-pago está no total que o Stripe cobra', async () => {
    const { res, order } = await criar({ country: 'Estados Unidos', state: 'CA', paymentMethod: 'card', carrier: 'ems' });
    expect(res.statusCode).toBe(201);
    const pb = order.priceBreakdown;
    expect(order.currency).toBe('USD');
    expect(pb.importDuty).toBe(Math.round(pb.products * 0.125 + 2.77));
    expect(pb.products + pb.shipping + pb.psFee + pb.importDuty).toBe(order.total);
    const { amount, currency } = mocks.create.mock.calls[0][0];
    expect(currency).toBe('usd');
    expect(amount).toBe(order.total * 100);
  });

  it('Japão: total em ienes, o Stripe recebe o valor sem multiplicar', async () => {
    const { res, order } = await criar({ country: 'Japão', prefecture: 'Mie', carrier: 'yamato', paymentMethod: 'card' });
    expect(res.statusCode).toBe(201);
    expect(order.currency).toBe('JPY');
    expect(mocks.create.mock.calls[0][0].amount).toBe(order.total);
    expect(order.total).toBe(order.totalYen);
  });
});

describe('create-order: forma de pagamento por país', () => {
  it('a regra: Japão só cartão; Brasil PIX e cartão; demais países só cartão', () => {
    expect(paymentMethodsForCountry('Japão')).toEqual(['card']);
    expect(paymentMethodsForCountry('Brasil')).toEqual(['pix', 'card']);
    expect(paymentMethodsForCountry('Portugal')).toEqual(['card']);
    expect(paymentMethodsForCountry('Estados Unidos')).toEqual(['card']);
  });

  it.each([
    ['Portugal', { country: 'Portugal', state: '' }],
    ['Estados Unidos', { country: 'Estados Unidos', state: 'CA' }],
    ['Japão', { country: 'Japão', prefecture: 'Tokyo', carrier: 'yuubin' }],
  ])('recusa PIX em %s', async (_nome, opcoes) => {
    const req = pedido({ ...opcoes, paymentMethod: 'pix' });
    const res = resposta();
    await handleCreate(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'payment_method_unavailable' });
    expect(injected.db.get(`orders/${req.body.orderId}`)).toBeUndefined();
  });

  it('aceita PIX no Brasil e cartão em qualquer país', async () => {
    expect((await criar({ paymentMethod: 'pix' })).res.statusCode).toBe(201);
    expect((await criar({ country: 'Portugal', state: '', paymentMethod: 'card' })).res.statusCode).toBe(201);
  });

  it.each(['wise', 'paypay', 'yucho', 'bank'])('não aceita %s', async (metodo) => {
    const res = resposta();
    await handleCreate(pedido({ paymentMethod: metodo }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_payment_method' });
  });
});
