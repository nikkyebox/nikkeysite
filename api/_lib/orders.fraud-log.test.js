// O painel de Fraude nunca recebeu um registro sequer: quem gravava
// `fraud_attempts` era `cpfGuardService.logFraudAttempt`, no navegador, e
// nenhuma tela chegou a chamar. Mesmo que chamasse, quem burla o limite é
// justamente quem tem motivo para não executar esse código.
//
// Agora quem registra é o servidor, no ponto em que ele de fato recusa.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  verify: vi.fn(),
  limitar: vi.fn(),
  banco: new Map(),
}));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));

vi.mock('./fx.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getFxRates: async () => ({ BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150, source: 'fallback' }),
}));

vi.mock('./mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendMail: vi.fn(),
}));

function snap(id, dados) {
  return { id, exists: dados !== undefined, data: () => dados };
}

vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => ({ verifyIdToken: mocks.verify }),
  adminDb: () => ({
    collection: (colecao) => ({
      doc: (id) => ({ __path: `${colecao}/${id}`, __id: id, async get() { return snap(id, mocks.banco.get(`${colecao}/${id}`)); } }),
      add: mocks.add,
    }),
    async getAll(...refs) {
      return refs.map((ref) => snap(ref.__id, mocks.banco.get(ref.__path)));
    },
  }),
}));

const { handleCreate } = await import('../orders.js');

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

/** Pedido com cupom de afiliado, vindo de um CPF que já usou outro afiliado. */
function pedido() {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: {
      orderId: 'SC-JP-123456',
      items: [{ productId: 'p1', variantId: 'small', quantity: 1 }],
      country: 'Brasil',
      prefecture: '',
      state: 'SP',
      shippingCarrier: 'ems',
      paymentMethod: 'wise',
      couponCode: 'ANA10',
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

beforeEach(() => {
  mocks.add.mockReset().mockResolvedValue({ id: 'f1' });
  mocks.limitar.mockReset().mockResolvedValue(undefined);
  mocks.verify.mockReset().mockResolvedValue({ uid: 'u1', email: 'cliente@exemplo.com' });
  mocks.banco.clear();
  mocks.banco.set('products/p1', { name: 'Produto', prices: { small: 1000 }, weightGrams: 500, stock: { unlimited: true } });
  mocks.banco.set('affiliates/ANA10', { active: true, discountPercent: 10, commissionPercent: 10, ownerEmail: 'ana@exemplo.com' });
  // Este CPF já usou desconto de afiliado numa compra anterior.
  mocks.banco.set(`cpf_index/${CPF}`, { productIds: [], affiliateCodes: ['OUTRO'] });
});

describe('registro de tentativa de fraude', () => {
  it('grava a tentativa quando recusa a reutilização de cupom de afiliado', async () => {
    const res = resposta();

    await handleCreate(pedido(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'affiliate_coupon_already_used' });

    const [colecaoRef] = mocks.add.mock.calls;
    expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(colecaoRef[0]).toMatchObject({
      attemptType: 'affiliate_reuse',
      affiliateCode: 'ANA10',
      cpfFull: CPF,
      customerEmail: 'cliente@exemplo.com',
      customerName: 'Cliente Teste',
    });
    // O painel mostra o mascarado e busca pelo completo.
    expect(colecaoRef[0].cpf).toBe('390***44705');
    expect(colecaoRef[0].blockedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // Perder uma linha de log é muito menos grave do que transformar um bloqueio
  // legítimo em erro 500 — o cliente veria "algo deu errado" e tentaria de novo.
  it('falha ao gravar o log não vira erro 500', async () => {
    mocks.add.mockRejectedValue(new Error('firestore fora'));
    const res = resposta();

    await handleCreate(pedido(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'affiliate_coupon_already_used' });
  });

  it('pedido limpo passa sem registrar nada', async () => {
    mocks.banco.set(`cpf_index/${CPF}`, { productIds: [], affiliateCodes: [] });
    const res = resposta();

    await handleCreate(pedido(), res);

    expect(res.statusCode).not.toBe(409);
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
