// Integração da reserva de promoção da home: dois checkouts simultâneos na
// última unidade devem resultar em um 409 `promotion_unavailable` ao tentar
// confirmar o pagamento, não em dois pedidos criados com o mesmo problema
// aparecendo só no `fulfillment.js`.
//
// O teste central é o primeiro: um pedido já reservou a última unidade, e um
// segundo checkout vê o saldo zerado DENTRO da transação, recusando-o.
// Regressão do resto do CRÍTICO 3 do AUDITORIA.md: sem a trava transacional,
// ambos passam na cotação (lida fora de transação) e chegam à criação.
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

// Harness estendido do points-hold: adiciona suporte para promo_state.
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
const PEDIDO1 = 'SC-JP-200001';
const PEDIDO2 = 'SC-JP-200002';
const HORA = 60 * 60 * 1000;

function pedido(orderId, promoQuantity = 1) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: {
      orderId,
      items: [{ productId: promoQuantity > 0 ? 'p1_promo' : 'p1', variantId: 'small', quantity: promoQuantity }],
      country: 'Brasil',
      prefecture: '',
      state: 'SP',
      shippingCarrier: 'ems',
      paymentMethod: 'pix',
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

function banco(overrides = {}) {
  return new FakeDb({
    'products/p1': { name: 'Produto', prices: { small: 10000 }, weightGrams: 500, stock: { unlimited: true } },
    'siteContent/homePromotion': {
      productId: 'p1',
      promoPriceYen: 3000,
      maxProducts: 1,
      soldCount: 0,
      limitPerPerson: 1,
      expiresAt: Date.now() + 24 * HORA,
    },
    'promo_state/homePromotion': {
      rodada: 'p1|' + (Date.now() + 24 * HORA),
      holds: [],
    },
    'users/u1': { email: 'cliente@exemplo.com', points: 0 },
    ...overrides,
  });
}

beforeEach(() => {
  mocks.limitar.mockReset().mockResolvedValue(undefined);
  mocks.verify.mockReset().mockResolvedValue({ uid: 'u1', email: 'cliente@exemplo.com' });
  injected.db = null;
});

describe('reserva de unidade da promoção da home', () => {
  it('recusa o segundo checkout quando a última unidade está reservada', async () => {
    const agora = Date.now();
    const expiresAt = agora + 24 * HORA;
    const rodada = `p1|${expiresAt}`;
    injected.db = banco({
      'siteContent/homePromotion': {
        productId: 'p1',
        promoPriceYen: 3000,
        maxProducts: 1,
        soldCount: 0,
        limitPerPerson: 1,
        expiresAt,
      },
      'promo_state/homePromotion': {
        rodada,
        holds: [{ orderId: 'SC-JP-199999', quantity: 1, expiresAt: agora + HORA }],
      },
    });

    const res = resposta();
    await handleCreate(pedido(PEDIDO1), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'promotion_unavailable' });
    expect(injected.db.get(`orders/${PEDIDO1}`)).toBeUndefined();
    // Hold do pedido anterior continua de pé.
    const estadoApos = injected.db.get('promo_state/homePromotion');
    expect(estadoApos.holds).toHaveLength(1);
    expect(estadoApos.holds[0].orderId).toBe('SC-JP-199999');
  });

  it('libera a reserva quando o pedido cai em payment_review', async () => {
    const agora = Date.now();
    const expiresAt = agora + 24 * HORA;
    const rodada = `p1|${expiresAt}`;
    injected.db = banco({
      'siteContent/homePromotion': {
        productId: 'p1',
        promoPriceYen: 3000,
        maxProducts: 10,
        soldCount: 0,
        limitPerPerson: 1,
        expiresAt,
      },
      'promo_state/homePromotion': {
        rodada,
        holds: [{ orderId: PEDIDO1, quantity: 1, expiresAt: agora + HORA }],
      },
      [`orders/${PEDIDO1}`]: {
        userId: 'u1',
        cpf: CPF,
        homePromoQuantity: 1,
        status: 'payment_review',
      },
    });

    const { markFulfillmentReview } = await import('./fulfillment.js');
    await markFulfillmentReview(PEDIDO1, 'test_reason');

    const estadoApos = injected.db.get('promo_state/homePromotion');
    expect(estadoApos.holds).toHaveLength(0);
  });

  it('hold vencido não bloqueia um novo checkout', async () => {
    const agora = Date.now();
    const expiresAt = agora + 24 * HORA;
    const rodada = `p1|${expiresAt}`;
    injected.db = banco({
      'siteContent/homePromotion': {
        productId: 'p1',
        promoPriceYen: 3000,
        maxProducts: 1,
        soldCount: 0,
        limitPerPerson: 1,
        expiresAt,
      },
      'promo_state/homePromotion': {
        rodada,
        holds: [{ orderId: 'SC-JP-199999', quantity: 1, expiresAt: agora - HORA }],
      },
    });

    const res = resposta();
    await handleCreate(pedido(PEDIDO1), res);

    expect(res.statusCode).toBe(201);
    expect(injected.db.get(`orders/${PEDIDO1}`)).toBeDefined();
    const estadoApos = injected.db.get('promo_state/homePromotion');
    // Vencido foi podado, novo hold foi adicionado.
    expect(estadoApos.holds).toHaveLength(1);
    expect(estadoApos.holds[0].orderId).toBe(PEDIDO1);
  });

  it('substitui hold anterior do mesmo pedido (retentativa de criação)', async () => {
    const agora = Date.now();
    const expiresAt = agora + 24 * HORA;
    const rodada = `p1|${expiresAt}`;
    injected.db = banco({
      'siteContent/homePromotion': {
        productId: 'p1',
        promoPriceYen: 3000,
        maxProducts: 10,
        soldCount: 0,
        limitPerPerson: 5,
        expiresAt,
      },
      'promo_state/homePromotion': {
        rodada,
        holds: [{ orderId: PEDIDO1, quantity: 2, expiresAt: agora + HORA }],
      },
    });

    const res = resposta();
    // Retentativa: mesmo orderId, mesma quantidade. Hold não dobra.
    await handleCreate(pedido(PEDIDO1, 2), res);

    expect(res.statusCode).toBe(201);
    const estadoApos = injected.db.get('promo_state/homePromotion');
    expect(estadoApos.holds).toHaveLength(1);
    expect(estadoApos.holds[0].orderId).toBe(PEDIDO1);
    expect(estadoApos.holds[0].quantity).toBe(2);
  });

  // A CORRIDA de verdade — a razão de este fix existir. Os casos acima passam
  // já na cotação, que roda FORA de transação; sozinhos, eles deixam apagar a
  // revalidação atômica sem a suíte reclamar.
  //
  // Aqui o estado muda DEPOIS da leitura da cotação e ANTES da transação, que é
  // exatamente a janela entre dois checkouts simultâneos na última unidade: os
  // dois leem "sobra 1", os dois passam na cotação, e só a transação pode
  // desempatar. Sem ela, os dois pedidos nascem e o segundo morre em
  // `payment_review` com o cartão já debitado.
  it('recusa quando a última unidade é tomada entre a cotação e a transação', async () => {
    const agora = Date.now();
    const expiresAt = agora + 24 * HORA;
    const db = banco({
      'siteContent/homePromotion': {
        productId: 'p1', promoPriceYen: 3000, maxProducts: 1, soldCount: 0, limitPerPerson: 1, expiresAt,
      },
      // Na cotação ainda não há reserva nenhuma: a promoção parece disponível.
      'promo_state/homePromotion': { rodada: `p1|${expiresAt}`, holds: [] },
    });

    // O concorrente fecha a compra no instante em que a transação começa.
    const runTransactionOriginal = db.runTransaction.bind(db);
    db.runTransaction = (callback) => {
      db.docs.set('promo_state/homePromotion', {
        rodada: `p1|${expiresAt}`,
        holds: [{ orderId: 'SC-JP-299999', quantity: 1, expiresAt: agora + HORA }],
      });
      return runTransactionOriginal(callback);
    };
    injected.db = db;

    const res = resposta();
    await handleCreate(pedido(PEDIDO2), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'promotion_unavailable' });
    expect(db.get(`orders/${PEDIDO2}`)).toBeUndefined();
    // A reserva do concorrente sobrevive intacta: perder a corrida não pode
    // roubar a unidade de quem chegou primeiro.
    const estadoApos = db.get('promo_state/homePromotion');
    expect(estadoApos.holds).toHaveLength(1);
    expect(estadoApos.holds[0].orderId).toBe('SC-JP-299999');
  });
});
