// MEDIO 2 do AUDITORIA.md: o saldo de pontos era conferido fora de transação e
// só debitado no `fulfillOrder`. Entre criar o pedido e confirmar o pagamento
// os pontos ficavam livres — dois checkouts do mesmo cliente liam o mesmo
// saldo, os dois passavam, os dois eram cobrados, e o segundo estourava
// `insufficient_points` com o cartão já debitado.
//
// A correção reserva os pontos no próprio documento do usuário, dentro da
// transação que cria o pedido (é o que faz o Firestore serializar os dois
// checkouts). `points-hold.test.js` cobre a aritmética da reserva; aqui o que
// está sob teste é a FIAÇÃO: sem estes casos, apagar o bloco de reserva de
// `orders.js` deixa a suíte inteira verde.
//
// O caso central é o segundo: saldo bruto suficiente, disponível insuficiente.
// É exatamente a diferença entre `Number(userData.points)` e
// `pontosDisponiveis(userData)` — a conta que o bug fazia errado.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const injected = vi.hoisted(() => ({ db: null }));
const mocks = vi.hoisted(() => ({ verify: vi.fn(), limitar: vi.fn() }));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));

vi.mock('./fx.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getFxRates: async () => ({ BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150, source: 'fallback' }),
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

// Mesma semântica do fake de `fulfillment.test.js`: a transação trabalha numa
// cópia e só publica no fim. Sem isso um `throw` no meio do callback deixaria
// escritas parciais no banco e o caso da recusa passaria por acidente.
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
      // `recentProductSpendYen` consulta os pedidos do cliente para achar o
      // multiplicador. Ela engole exceções e cai para Bronze, então um fake sem
      // `where` esconderia um erro real de fiação.
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
function pedido(redeemPoints) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: {
      orderId: PEDIDO,
      items: [{ productId: 'p1', variantId: 'small', quantity: 1 }],
      country: 'Brasil',
      prefecture: '',
      state: 'SP',
      shippingCarrier: 'ems',
      paymentMethod: 'wise',
      couponCode: '',
      redeemPoints,
      negotiationId: '',
      promoCode: '',
      customer: {
        name: 'Cliente Teste', email: 'cliente@exemplo.com', phone: '', cpf: CPF,
        postalCode: '01310-100', city: 'Sao Paulo', address: 'Av Paulista 1000', building: '',
      },
    },
  };
}

// O subtotal precisa ser bem maior que o resgate: `buildQuote` corta o resgate
// no valor da mercadoria, e um teto batendo mudaria o número reservado.
function banco(usuario) {
  return new FakeDb({
    'products/p1': { name: 'Produto', prices: { small: 10000 }, weightGrams: 500, stock: { unlimited: true } },
    'users/u1': usuario,
  });
}

beforeEach(() => {
  mocks.limitar.mockReset().mockResolvedValue(undefined);
  mocks.verify.mockReset().mockResolvedValue({ uid: 'u1', email: 'cliente@exemplo.com' });
  injected.db = null;
});

describe('reserva de pontos ao criar o pedido', () => {
  it('grava a reserva de pontos no documento do usuário', async () => {
    injected.db = banco({ points: 1000, email: 'cliente@exemplo.com' });
    const res = resposta();

    await handleCreate(pedido(500), res);

    expect(res.statusCode).toBe(201);
    const holds = injected.db.get('users/u1').pointsHolds;
    expect(holds).toHaveLength(1);
    expect(holds[0].orderId).toBe(PEDIDO);
    expect(holds[0].points).toBe(500);
    expect(holds[0].expiresAt).toBeGreaterThan(Date.now());
    // Os pontos só saem do saldo quando o pagamento confirma; até lá a reserva
    // é a única coisa que impede o segundo checkout de gastar de novo.
    expect(injected.db.get('users/u1').points).toBe(1000);
  });

  // O saldo bruto (1000) cobre o resgate (500), o disponível (100) não. Se a
  // conta ignorar a reserva vigente, o cliente gasta os mesmos pontos duas
  // vezes — que é precisamente o bug do MEDIO 2.
  it('recusa quando o saldo já está reservado por outro pedido', async () => {
    injected.db = banco({
      points: 1000,
      email: 'cliente@exemplo.com',
      pointsHolds: [{ orderId: 'SC-JP-999999', points: 900, expiresAt: Date.now() + HORA }],
    });
    const res = resposta();

    await handleCreate(pedido(500), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'insufficient_points' });
    expect(injected.db.get(`orders/${PEDIDO}`)).toBeUndefined();
    // A reserva do outro pedido continua de pé: recusar não pode consumi-la.
    expect(injected.db.get('users/u1').pointsHolds).toEqual([
      { orderId: 'SC-JP-999999', points: 900, expiresAt: expect.any(Number) },
    ]);
  });

  it('pedido sem resgate não toca o documento do usuário', async () => {
    const usuario = { points: 1000, email: 'cliente@exemplo.com' };
    injected.db = banco(usuario);
    const res = resposta();

    await handleCreate(pedido(0), res);

    expect(res.statusCode).toBe(201);
    expect(injected.db.get(`orders/${PEDIDO}`)).toBeDefined();
    expect(injected.db.get('users/u1')).toEqual(usuario);
    expect(injected.db.get('users/u1')).not.toHaveProperty('pointsHolds');
  });

  // Não existe cancelamento de pedido no servidor: sem prazo, um checkout
  // abandonado seguraria os pontos do cliente para sempre.
  it('reserva vencida não bloqueia um novo resgate', async () => {
    injected.db = banco({
      points: 1000,
      email: 'cliente@exemplo.com',
      pointsHolds: [{ orderId: 'SC-JP-888888', points: 1000, expiresAt: Date.now() - HORA }],
    });
    const res = resposta();

    await handleCreate(pedido(500), res);

    expect(res.statusCode).toBe(201);
    const holds = injected.db.get('users/u1').pointsHolds;
    expect(holds).toHaveLength(1);
    expect(holds[0].orderId).toBe(PEDIDO);
    expect(holds[0].points).toBe(500);
  });
});
