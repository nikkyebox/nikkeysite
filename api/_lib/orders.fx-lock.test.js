// Trava de câmbio: o cliente manda o total que está vendo (`expectedTotal`) e o
// id da cotação com que a tela calculou (`ratesId`). O servidor recalcula com a
// MESMA cotação (enquanto for a atual ou a anterior recente) e, se o total ainda
// assim diferir, recusa com 409 `price_changed` sem criar pedido nem cobrar.
// Os dois campos são opcionais: cliente antigo segue com o comportamento de sempre.
//
// Usa o `fx.js` de verdade, com a cotação guardada em `fx_rates/current`.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const injected = vi.hoisted(() => ({ db: null }));
const mocks = vi.hoisted(() => ({ verify: vi.fn(), limitar: vi.fn(), create: vi.fn(), fetch: vi.fn() }));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.paymentIntents = { create: mocks.create, retrieve: vi.fn() };
    }
  },
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
const { resetFxMemory } = await import('./fx.js');

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

  orderPaths() {
    return [...this.docs.keys()].filter((path) => path.startsWith('orders/'));
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

const MIN = 60 * 1000;
const HORA = 60 * MIN;

/** Cotação atual (nova) e a anterior (BRL mais alto, para o total diferir). */
function cotacoes({ previousAgeMs = 20 * MIN } = {}) {
  const agora = Date.now();
  const current = { id: `open-er-${agora - MIN}`, BRL: 0.0345, EUR: 0.0061, USD: 0.0067, source: 'open-er', loadedAt: agora - MIN };
  const previous = { id: `open-er-${agora - previousAgeMs}`, BRL: 0.0362, EUR: 0.0064, USD: 0.0070, source: 'open-er', loadedAt: agora - previousAgeMs };
  return { current, previous };
}

function banco(fx = cotacoes()) {
  return new FakeDb({
    'products/p1': { name: 'Produto', prices: { small: 8150 }, weightGrams: 500, stock: { unlimited: true } },
    'users/u1': { email: 'cliente@exemplo.com', points: 0 },
    ...(fx ? { 'fx_rates/current': fx } : {}),
  });
}

let contador = 500000;
function pedido(extra = {}) {
  contador += 1;
  return {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: {
      orderId: `SC-JP-${contador}`,
      items: [{ productId: 'p1', variantId: 'small', quantity: 1 }],
      country: 'Brasil',
      prefecture: '',
      state: 'SP',
      shippingCarrier: 'ems',
      paymentMethod: 'card',
      couponCode: '',
      redeemPoints: 0,
      negotiationId: '',
      promoCode: '',
      customer: {
        name: 'Cliente Teste', email: 'cliente@exemplo.com', phone: '', cpf: '39053344705',
        postalCode: '01310-100', city: 'Sao Paulo', address: 'Av Paulista 1000', building: '',
      },
      ...extra,
    },
  };
}

async function enviar(extra) {
  const req = pedido(extra);
  const res = resposta();
  await handleCreate(req, res);
  return { res, req, order: injected.db.get(`orders/${req.body.orderId}`) };
}

/** Total que o servidor calcularia com a cotação indicada (pedido de sondagem em outro banco). */
async function totalCom(ratesId) {
  const guardado = injected.db;
  injected.db = banco(guardado.get('fx_rates/current'));
  resetFxMemory();
  const { res, order } = await enviar(ratesId ? { ratesId } : {});
  injected.db = guardado;
  resetFxMemory();
  expect(res.statusCode).toBe(201);
  return order.total;
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
  mocks.limitar.mockReset().mockResolvedValue(undefined);
  mocks.verify.mockReset().mockResolvedValue({ uid: 'u1', email: 'cliente@exemplo.com' });
  mocks.create.mockReset().mockImplementation(async (params) => ({ id: 'pi_1', client_secret: 'secret', ...params }));
  mocks.fetch.mockReset().mockRejectedValue(new Error('rede desligada nos testes'));
  vi.stubGlobal('fetch', mocks.fetch);
  injected.db = banco();
  resetFxMemory();
});

describe('create-order: trava de câmbio (expectedTotal + ratesId)', () => {
  it('total igual ao do servidor passa e cria o pedido', async () => {
    const { current } = injected.db.get('fx_rates/current');
    const esperado = await totalCom(current.id);
    const { res, order } = await enviar({ expectedTotal: esperado, ratesId: current.id });
    expect(res.statusCode).toBe(201);
    expect(order.total).toBe(esperado);
  });

  it('cliente que viu a cotação anterior (ainda aceita) paga exatamente o que viu', async () => {
    const { previous } = injected.db.get('fx_rates/current');
    const visto = await totalCom(previous.id);
    const atual = await totalCom('');
    expect(visto).not.toBe(atual);
    const { res, order } = await enviar({ expectedTotal: visto, ratesId: previous.id });
    expect(res.statusCode).toBe(201);
    expect(order.total).toBe(visto);
    expect(order.fxSource).toBe('open-er');
  });

  it('cotação mudou e o total difere: 409 price_changed, sem pedido nem cobrança, com a cotação nova', async () => {
    const { current, previous } = injected.db.get('fx_rates/current');
    const antigo = await totalCom(previous.id);
    const novo = await totalCom(current.id);
    mocks.create.mockClear();
    // Cliente viu o total antigo mas não informou o id (ou informou um que já não vale).
    const { res, order } = await enviar({ expectedTotal: antigo });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('price_changed');
    expect(res.body.quote).toEqual({
      currency: 'BRL',
      total: novo,
      totalYen: expect.any(Number),
      ratesId: current.id,
      fxSource: 'open-er',
      rates: { BRL: current.BRL, EUR: current.EUR, USD: current.USD },
    });
    expect(order).toBeUndefined();
    expect(mocks.create).not.toHaveBeenCalled();
    // Confirmando de novo com o total e o id novos, passa.
    const segunda = await enviar({ expectedTotal: res.body.quote.total, ratesId: res.body.quote.ratesId });
    expect(segunda.res.statusCode).toBe(201);
    expect(segunda.order.total).toBe(novo);
  });

  it('sem expectedTotal nem ratesId: comportamento de sempre (cotação atual, sem conferir total)', async () => {
    const { current } = injected.db.get('fx_rates/current');
    const { res, order } = await enviar();
    expect(res.statusCode).toBe(201);
    expect(res.body.order).toBeDefined();
    expect(order.total).toBe(await totalCom(current.id));
  });

  it('só ratesId (sem expectedTotal): usa a cotação do id e não recusa', async () => {
    const { previous } = injected.db.get('fx_rates/current');
    const { res, order } = await enviar({ ratesId: previous.id });
    expect(res.statusCode).toBe(201);
    expect(order.total).toBe(await totalCom(previous.id));
  });

  it('snapshot expirado (anterior com mais de 2 h): usa a atual e recusa o total da cotação vencida', async () => {
    injected.db = banco(cotacoes({ previousAgeMs: 3 * HORA }));
    const { current, previous } = injected.db.get('fx_rates/current');
    const atual = await totalCom('');
    expect(await totalCom(previous.id)).toBe(atual);
    const { res, order } = await enviar({ expectedTotal: atual + 7, ratesId: previous.id });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('price_changed');
    expect(res.body.quote.ratesId).toBe(current.id);
    expect(res.body.quote.total).toBe(atual);
    expect(order).toBeUndefined();
    expect(injected.db.orderPaths()).toEqual([]);
  });

  it('snapshot inexistente (id que o servidor nunca emitiu): usa a atual; total certo passa, errado é recusado', async () => {
    const desconhecido = 'open-er-1234567890123';
    const atual = await totalCom('');
    const ok = await enviar({ expectedTotal: atual, ratesId: desconhecido });
    expect(ok.res.statusCode).toBe(201);
    expect(ok.order.total).toBe(atual);
    const errado = await enviar({ expectedTotal: atual + 100, ratesId: desconhecido });
    expect(errado.res.statusCode).toBe(409);
    expect(errado.res.body.error).toBe('price_changed');
    expect(errado.order).toBeUndefined();
  });

  it('retentativa do mesmo pedido já criado não confere o total de novo', async () => {
    const { current } = injected.db.get('fx_rates/current');
    const primeira = await enviar({ expectedTotal: await totalCom(current.id), ratesId: current.id });
    expect(primeira.res.statusCode).toBe(201);
    const repetida = resposta();
    await handleCreate({ ...primeira.req, body: { ...primeira.req.body, expectedTotal: 1 } }, repetida);
    expect(repetida.statusCode).toBe(200);
  });

  it('recusa ratesId mal formado e expectedTotal inválido (400)', async () => {
    for (const extra of [
      { ratesId: 'x; drop table' },
      { ratesId: 'open-er-abc' },
      { expectedTotal: -1 },
      { expectedTotal: 'abc' },
    ]) {
      const { res, order } = await enviar(extra);
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_request' });
      expect(order).toBeUndefined();
    }
  });
});
