// Overselling: estoque limitado ("Quantidade específica" no admin) era
// validado FORA de transação, em cima de uma leitura de minutos atrás (a
// checagem de `stockByProduct` em `orders.js`). Dois checkouts simultâneos do
// mesmo produto liam o mesmo `stock.quantity`, os dois passavam, os dois
// eram cobrados no Stripe — só na baixa real (`fulfillment.js`, na
// confirmação de pagamento) um deles estourava `insufficient_stock`, com o
// cartão do cliente já debitado.
//
// A correção reserva o estoque no próprio documento do produto, dentro da
// transação que cria o pedido (mesma técnica de `orders.points-hold.test.js`).
// `stock-hold.test.js` cobre a aritmética da reserva; aqui o que está sob
// teste é a FIAÇÃO: sem o bloco de reserva em `orders.js`, esta suíte inteira
// fica verde.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const injected = vi.hoisted(() => ({ db: null }));
const mocks = vi.hoisted(() => ({ verify: vi.fn(), limitar: vi.fn() }));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));

vi.mock('./fx.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getFxRates: async () => ({ BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150, source: 'open-er' }),
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

function setDotted(target, key, value) {
  const parts = key.split('.');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor[parts[index]] ||= {};
    cursor = cursor[parts[index]];
  }
  cursor[parts.at(-1)] = value;
}

// Mesma semântica do fake de `orders.points-hold.test.js`: a transação
// trabalha numa cópia e só publica no fim.
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
const PEDIDO = 'SC-JP-100001';
const HORA = 60 * 60 * 1000;

/** Pedido simples: sem cupom, sem afiliado, sem promoção e fora do Stripe. */
function pedido(quantity = 2) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: {
      orderId: PEDIDO,
      items: [{ productId: 'p1', variantId: 'small', quantity }],
      country: 'Brasil',
      prefecture: '',
      state: 'SP',
      shippingCarrier: 'ems',
      paymentMethod: 'wise',
      couponCode: '',
      redeemPoints: 0,
      negotiationId: '',
      promoCode: '',
      customer: {
        name: 'Cliente Teste', email: 'cliente@exemplo.com', phone: '', cpf: CPF,
        postalCode: '01310-100', city: 'Sao Paulo', address: 'Av Paulista 1000', building: '',
      },
    },
  };
}

function banco(stock) {
  return new FakeDb({
    'products/p1': { name: 'Produto', prices: { small: 1000 }, weightGrams: 500, ...stock },
    'users/u1': { points: 0, email: 'cliente@exemplo.com' },
  });
}

beforeEach(() => {
  mocks.limitar.mockReset().mockResolvedValue(undefined);
  mocks.verify.mockReset().mockResolvedValue({ uid: 'u1', email: 'cliente@exemplo.com' });
  injected.db = null;
});

describe('reserva de estoque ao criar o pedido', () => {
  it('grava a reserva no documento do produto sem baixar o estoque ainda', async () => {
    injected.db = banco({ stock: { unlimited: false, quantity: 5 } });
    const res = resposta();

    await handleCreate(pedido(2), res);

    expect(res.statusCode).toBe(201);
    const produto = injected.db.get('products/p1');
    expect(produto.stockHolds).toHaveLength(1);
    expect(produto.stockHolds[0]).toMatchObject({ orderId: PEDIDO, quantity: 2 });
    expect(produto.stockHolds[0].expiresAt).toBeGreaterThan(Date.now());
    // O estoque só baixa de verdade quando o pagamento confirma (`fulfillment.js`);
    // até lá a reserva é a única coisa que impede outro checkout de vender a
    // mesma unidade.
    expect(produto.stock.quantity).toBe(5);
  });

  // Só resta 1 unidade livre (5 no estoque, 4 já reservadas por outro
  // pedido); pedir 2 tem que ser recusado ANTES de cobrar no Stripe. Se a
  // conta ignorar a reserva vigente, dois clientes compram a última unidade.
  it('recusa quando o estoque já está reservado por outro pedido', async () => {
    injected.db = banco({
      stock: { unlimited: false, quantity: 5 },
      stockHolds: [{ orderId: 'SC-JP-999999', quantity: 4, expiresAt: Date.now() + HORA }],
    });
    const res = resposta();

    await handleCreate(pedido(2), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'insufficient_stock' });
    expect(injected.db.get(`orders/${PEDIDO}`)).toBeUndefined();
    // A reserva do outro pedido continua de pé: recusar não pode consumi-la.
    expect(injected.db.get('products/p1').stockHolds).toEqual([
      { orderId: 'SC-JP-999999', quantity: 4, expiresAt: expect.any(Number) },
    ]);
  });

  it('produto com estoque ilimitado não precisa de reserva', async () => {
    injected.db = banco({ stock: { unlimited: true } });
    const res = resposta();

    await handleCreate(pedido(3), res);

    expect(res.statusCode).toBe(201);
    expect(injected.db.get('products/p1')).not.toHaveProperty('stockHolds');
  });

  // Não existe cancelamento de pedido no servidor: sem prazo, um checkout
  // abandonado prenderia a unidade para sempre.
  it('reserva vencida não bloqueia um novo checkout', async () => {
    injected.db = banco({
      stock: { unlimited: false, quantity: 5 },
      stockHolds: [{ orderId: 'SC-JP-888888', quantity: 5, expiresAt: Date.now() - HORA }],
    });
    const res = resposta();

    await handleCreate(pedido(2), res);

    expect(res.statusCode).toBe(201);
    const holds = injected.db.get('products/p1').stockHolds;
    expect(holds).toHaveLength(1);
    expect(holds[0].orderId).toBe(PEDIDO);
    expect(holds[0].quantity).toBe(2);
  });
});
