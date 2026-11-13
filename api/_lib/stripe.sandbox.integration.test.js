// @vitest-environment node
//
// Checkout de cartão de ponta a ponta contra o SANDBOX REAL do Stripe.
//
// O que é real: criação do PaymentIntent (`handleCreate` → `stripeIntent`),
// confirmação com cartões de teste, eventos `payment_intent.*` emitidos pelo
// Stripe e a verificação de assinatura do webhook.
// O que é simulado: Firestore (em memória), cotação de câmbio e envio de e-mail.
// Nada aqui escreve em produção nem manda e-mail a cliente.
//
// Só roda quando STRIPE_SANDBOX_KEY (uma `sk_test_...`) está no ambiente. Sem
// ela a suíte inteira é pulada — `npm test` nunca toca o Stripe. Uma chave
// `sk_live_` é recusada de propósito: este arquivo cria e confirma pagamentos.
//
//   STRIPE_SANDBOX_KEY=sk_test_... npx vitest run api/_lib/stripe.sandbox.integration.test.js
import Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const SANDBOX_KEY = String(process.env.STRIPE_SANDBOX_KEY || '');
const habilitado = SANDBOX_KEY.startsWith('sk_test_');
const WEBHOOK_SECRET = 'whsec_integration_local_only_0123456789';

vi.setConfig({ testTimeout: 90_000 });

const injected = vi.hoisted(() => ({ db: null }));
const mocks = vi.hoisted(() => ({ verify: vi.fn(), limitar: vi.fn(), sendMail: vi.fn() }));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));
vi.mock('./fx.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getFxRates: async () => ({ BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150, source: 'open-er' }),
}));
vi.mock('./mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendMail: mocks.sendMail,
}));
vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => ({ verifyIdToken: mocks.verify }),
  adminDb: () => injected.db,
}));

const { handleCreate } = await import('../orders.js');
const { default: webhook } = await import('../stripe-webhook.js');

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function setDotted(target, key, value) {
  const parts = key.split('.');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor[parts[index]] ||= {};
    cursor = cursor[parts[index]];
  }
  cursor[parts.at(-1)] = value;
}

// Mesma semântica dos fakes de orders.stock-hold.test.js e fulfillment.test.js.
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
        ref.set = async (value, options) => {
          const anterior = options?.merge ? (banco.docs.get(ref.path) || {}) : {};
          banco.docs.set(ref.path, { ...clone(anterior), ...clone(value) });
        };
        ref.update = async (value) => {
          const next = clone(banco.docs.get(ref.path) || {});
          for (const [key, fieldValue] of Object.entries(value)) setDotted(next, key, clone(fieldValue));
          banco.docs.set(ref.path, next);
        };
        return ref;
      },
      where: (campo, _operador, valor) => ({
        get: async () => ({
          docs: [...banco.docs]
            .filter(([path, value]) => path.startsWith(`${name}/`) && value?.[campo] === valor)
            .map(([path, value]) => ({ id: path.slice(name.length + 1), data: () => clone(value) })),
        }),
      }),
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
      set: (ref, value, options) => {
        const next = options?.merge ? { ...(working.get(ref.path) || {}), ...clone(value) } : clone(value);
        working.set(ref.path, next);
      },
      update: (ref, value) => {
        if (!working.has(ref.path)) throw new Error('not_found');
        const next = clone(working.get(ref.path));
        for (const [key, fieldValue] of Object.entries(value)) setDotted(next, key, clone(fieldValue));
        working.set(ref.path, next);
      },
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

const CPF = '39053344705';
const EMAIL = 'cliente@exemplo.com';
const RETURN_URL = 'https://nikkeybox.jp/pedido';
const ESTOQUE = 5;

// Número único por execução: o Stripe guarda a chave de idempotência por 24h,
// então reaproveitar um número devolveria o PaymentIntent da rodada anterior.
function novoPedido(prefixo = 'SC-JP') {
  return `${prefixo}-${String(900000 + Math.floor(Math.random() * 99999))}`;
}

function bancoNovo() {
  return new FakeDb({
    'products/p1': {
      name: 'Produto de teste',
      prices: { small: 5800 },
      weightGrams: 500,
      stock: { unlimited: false, quantity: ESTOQUE },
    },
    'users/u1': { points: 0, email: EMAIL },
  });
}

function requisicao(orderId, { pais = 'Japão', quantidade = 1 } = {}) {
  const brasil = pais === 'Brasil';
  return {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: {
      orderId,
      items: [{ productId: 'p1', variantId: 'small', quantity: quantidade }],
      country: pais,
      prefecture: brasil ? '' : 'Tokyo',
      state: brasil ? 'SP' : '',
      shippingCarrier: brasil ? 'ems' : 'yuubin',
      paymentMethod: 'card',
      couponCode: '',
      redeemPoints: 0,
      negotiationId: '',
      promoCode: '',
      customer: {
        name: 'Cliente Teste', email: EMAIL, phone: '',
        cpf: brasil ? CPF : '',
        postalCode: brasil ? '01310-100' : '100-0001',
        city: brasil ? 'Sao Paulo' : 'Chiyoda',
        address: brasil ? 'Av Paulista 1000' : '1-1 Chiyoda',
        building: '',
      },
    },
  };
}

async function criarPedido(orderId, opcoes) {
  const res = resposta();
  await handleCreate(requisicao(orderId, opcoes), res);
  return res;
}

describe.skipIf(!habilitado)('checkout com cartão — sandbox real do Stripe', () => {
  /** @type {Stripe} */
  let stripe;
  const chaveAnterior = process.env.STRIPE_SECRET_KEY;
  const segredoAnterior = process.env.STRIPE_WEBHOOK_SECRET;

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = SANDBOX_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    stripe = new Stripe(SANDBOX_KEY);
  });

  afterAll(() => {
    if (chaveAnterior === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = chaveAnterior;
    if (segredoAnterior === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = segredoAnterior;
  });

  beforeEach(() => {
    injected.db = bancoNovo();
    mocks.limitar.mockReset().mockResolvedValue(undefined);
    mocks.verify.mockReset().mockResolvedValue({ uid: 'u1', email: EMAIL });
    mocks.sendMail.mockReset().mockResolvedValue({});
  });

  const intentDe = (res) => String(res.body.clientSecret).split('_secret_')[0];
  const pagar = (id, metodo) => stripe.paymentIntents.confirm(id, { payment_method: metodo, return_url: RETURN_URL });

  // Os eventos do Stripe levam alguns segundos para aparecer na lista.
  async function eventoDe(intentId, tipo = 'payment_intent.succeeded') {
    for (let tentativa = 0; tentativa < 25; tentativa += 1) {
      const lista = await stripe.events.list({ type: tipo, limit: 40 });
      const achado = lista.data.find((evento) => evento.data.object.id === intentId);
      if (achado) return achado;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`evento ${tipo} de ${intentId} não apareceu em 25s`);
  }

  async function entregarWebhook(evento) {
    const payload = JSON.stringify(evento);
    const assinatura = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const res = resposta();
    await webhook({ method: 'POST', headers: { 'stripe-signature': assinatura }, body: Buffer.from(payload) }, res);
    return res;
  }

  it('JPY aprovado: cobra o total do pedido, baixa o estoque e responde replay sem duplicar', async () => {
    const orderId = novoPedido();
    const criado = await criarPedido(orderId);
    expect(criado.statusCode).toBe(201);

    const pedido = injected.db.get(`orders/${orderId}`);
    expect(pedido.currency).toBe('JPY');
    const id = intentDe(criado);
    const antes = await stripe.paymentIntents.retrieve(id);
    expect(antes.currency).toBe('jpy');
    expect(antes.amount).toBe(Math.round(pedido.totalPrice)); // iene não tem centavos
    expect(antes.metadata.orderId).toBe(orderId);
    expect(injected.db.get('products/p1').stock.quantity).toBe(ESTOQUE); // só reservado

    const pago = await pagar(id, 'pm_card_visa');
    expect(pago.status).toBe('succeeded');

    const primeira = await entregarWebhook(await eventoDe(id));
    expect(primeira.statusCode).toBe(200);
    expect(primeira.body).toEqual({ received: true, replay: false });
    expect(injected.db.get(`orders/${orderId}`)).toMatchObject({ status: 'confirmed', fulfillmentState: 'fulfilled' });
    expect(injected.db.get('products/p1').stock.quantity).toBe(ESTOQUE - 1);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);

    const repetida = await entregarWebhook(await eventoDe(id));
    expect(repetida.body).toEqual({ received: true, replay: true });
    expect(injected.db.get('products/p1').stock.quantity).toBe(ESTOQUE - 1); // não baixa 2x
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it('BRL aprovado: cobra em centavos e o webhook aceita o valor (sem cair em revisão)', async () => {
    const orderId = novoPedido('SC-JP');
    const criado = await criarPedido(orderId, { pais: 'Brasil' });
    expect(criado.statusCode).toBe(201);

    const pedido = injected.db.get(`orders/${orderId}`);
    expect(pedido.currency).toBe('BRL');
    const id = intentDe(criado);
    const antes = await stripe.paymentIntents.retrieve(id);
    expect(antes.currency).toBe('brl');
    expect(antes.amount).toBe(Math.round(pedido.totalPrice * 100));

    expect((await pagar(id, 'pm_card_visa')).status).toBe('succeeded');
    const res = await entregarWebhook(await eventoDe(id));
    expect(res.body).toEqual({ received: true, replay: false });
    expect(injected.db.get(`orders/${orderId}`)).toMatchObject({ status: 'confirmed', fulfillmentState: 'fulfilled' });
  });

  it('cartão recusado não confirma nada; o cliente tenta de novo no mesmo pedido e passa', async () => {
    const orderId = novoPedido();
    const criado = await criarPedido(orderId);
    const id = intentDe(criado);

    await expect(pagar(id, 'pm_card_chargeDeclined')).rejects.toMatchObject({ code: 'card_declined' });
    expect((await stripe.paymentIntents.retrieve(id)).status).toBe('requires_payment_method');
    expect(injected.db.get(`orders/${orderId}`).fulfillmentState).not.toBe('fulfilled');
    expect(injected.db.get('products/p1').stock.quantity).toBe(ESTOQUE);

    // Reenviar a criação devolve o MESMO PaymentIntent (idempotente), não cobra em dobro.
    const reenvio = await criarPedido(orderId);
    expect(reenvio.statusCode).toBe(200);
    expect(intentDe(reenvio)).toBe(id);

    expect((await pagar(id, 'pm_card_visa')).status).toBe('succeeded');
    const res = await entregarWebhook(await eventoDe(id));
    expect(res.body).toEqual({ received: true, replay: false });
    expect(injected.db.get('products/p1').stock.quantity).toBe(ESTOQUE - 1);
  });

  it.each([
    ['sem fundos', 'pm_card_chargeDeclinedInsufficientFunds', 'card_declined'],
    ['cartão expirado', 'pm_card_chargeDeclinedExpiredCard', 'expired_card'],
    ['CVC incorreto', 'pm_card_chargeDeclinedIncorrectCvc', 'incorrect_cvc'],
    ['cartão roubado', 'pm_card_chargeDeclinedStolenCard', 'card_declined'],
  ])('%s: recusa, pedido segue pendente e o estoque não muda', async (_nome, metodo, codigo) => {
    const orderId = novoPedido();
    const id = intentDe(await criarPedido(orderId));

    await expect(pagar(id, metodo)).rejects.toMatchObject({ code: codigo });
    expect((await stripe.paymentIntents.retrieve(id)).status).toBe('requires_payment_method');
    expect(injected.db.get(`orders/${orderId}`).fulfillmentState).not.toBe('fulfilled');
    expect(injected.db.get('products/p1').stock.quantity).toBe(ESTOQUE);
  });

  it('3D Secure pendente: fica em requires_action e nada é baixado até o cliente autenticar', async () => {
    const orderId = novoPedido();
    const id = intentDe(await criarPedido(orderId));

    const pago = await pagar(id, 'pm_card_authenticationRequired');
    expect(pago.status).toBe('requires_action');
    expect(injected.db.get(`orders/${orderId}`).fulfillmentState).not.toBe('fulfilled');
    expect(injected.db.get('products/p1').stock.quantity).toBe(ESTOQUE);
  });

  it('pagamento de OUTRO PaymentIntent com o mesmo orderId vai para revisão e não baixa estoque', async () => {
    const orderId = novoPedido();
    await criarPedido(orderId);

    // Alguém paga um PaymentIntent paralelo, de valor diferente, apontando para o pedido.
    const falso = await stripe.paymentIntents.create({
      amount: 100,
      currency: 'jpy',
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
      confirm: true,
      metadata: { orderId, userId: 'u1' },
    });
    expect(falso.status).toBe('succeeded');

    const res = await entregarWebhook(await eventoDe(falso.id));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, review: true });
    expect(injected.db.get(`orders/${orderId}`).fulfillmentState).not.toBe('fulfilled');
    expect(injected.db.get('products/p1').stock.quantity).toBe(ESTOQUE);
  });

  // Única conferência de VALOR do fluxo (o `fulfillOrder` só confere o id do
  // PaymentIntent): cobrança correta no Stripe, mas pedido com total diferente.
  it('valor cobrado diferente do total do pedido vai para revisão e não baixa estoque', async () => {
    const orderId = novoPedido();
    const id = intentDe(await criarPedido(orderId));
    await pagar(id, 'pm_card_visa');

    const pedido = injected.db.get(`orders/${orderId}`);
    injected.db.docs.set(`orders/${orderId}`, { ...pedido, totalPrice: pedido.totalPrice + 100 });

    const res = await entregarWebhook(await eventoDe(id));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, review: true });
    expect(injected.db.get(`orders/${orderId}`).fulfillmentState).not.toBe('fulfilled');
    expect(injected.db.get('products/p1').stock.quantity).toBe(ESTOQUE);
  });

  it('webhook com assinatura inválida é recusado antes de tocar no pedido', async () => {
    const orderId = novoPedido();
    const id = intentDe(await criarPedido(orderId));
    await pagar(id, 'pm_card_visa');
    const evento = await eventoDe(id);

    const payload = JSON.stringify(evento);
    const assinatura = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_outro_segredo_qualquer_123456' });
    const res = resposta();
    await webhook({ method: 'POST', headers: { 'stripe-signature': assinatura }, body: Buffer.from(payload) }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_stripe_signature' });
    expect(injected.db.get('products/p1').stock.quantity).toBe(ESTOQUE);
  });
});

describe.skipIf(habilitado)('checkout com cartão — sandbox real do Stripe (pulado)', () => {
  it('precisa de STRIPE_SANDBOX_KEY=sk_test_... no ambiente', () => {
    expect(SANDBOX_KEY.startsWith('sk_live_')).toBe(false);
  });
});
