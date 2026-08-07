// A loja teve 63 visitas ao checkout e 0 pedidos. A causa era esta: o servidor
// exigia `prefecture` — a província japonesa — em TODO pedido. O formulário
// manda string vazia quando o endereço não é do Japão, e `requiredText` recusa
// vazio, então todo cliente brasileiro batia em `400 invalid_request`.
//
// Como o público da loja é o Brasil, isso zerava as vendas.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), limitar: vi.fn(), verify: vi.fn() }));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));

vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => ({ verifyIdToken: mocks.verify }),
  adminDb: () => ({
    collection: () => ({ doc: () => ({ get: mocks.get }) }),
  }),
}));

vi.mock('./mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendMail: vi.fn(),
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

/** Payload igual ao que `checkoutService.prepareCheckout` monta. */
function pedido(country, prefecture) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: {
      orderId: 'SC-JP-123456',
      items: [{ productId: 'abc', variantId: 'small', quantity: 1 }],
      country,
      prefecture,
      state: country === 'Brasil' ? 'SP' : '',
      shippingCarrier: 'ems',
      paymentMethod: 'wise',
      couponCode: '',
      redeemPoints: 0,
      negotiationId: '',
      promoCode: '',
      customer: {
        name: 'Cliente', email: 'cliente@exemplo.com', phone: '', cpf: '',
        postalCode: '01310-100', city: 'Sao Paulo', address: 'Av Paulista 1000', building: '',
      },
    },
  };
}

describe('create-order: prefecture', () => {
  beforeEach(() => {
    mocks.limitar.mockReset().mockResolvedValue(undefined);
    mocks.verify.mockReset().mockResolvedValue({ uid: 'u1', email: 'cliente@exemplo.com' });
    // Faz a execução parar logo depois da validação de entrada: o pedido não
    // existe e o produto some, então o fluxo morre adiante — o que importa
    // aqui é NÃO ter morrido em `invalid_request`.
    mocks.get.mockReset().mockResolvedValue({ exists: false, data: () => ({}) });
  });

  it('aceita endereço no Brasil sem província', async () => {
    const res = resposta();
    await handleCreate(pedido('Brasil', ''), res);

    // Qualquer coisa menos a recusa de entrada. Passou da validação.
    expect(res.body).not.toEqual({ error: 'invalid_request' });
  });

  it('aceita endereço no Japão com província', async () => {
    const res = resposta();
    await handleCreate(pedido('Japão', 'Tokyo'), res);

    expect(res.body).not.toEqual({ error: 'invalid_request' });
  });

  it('ainda exige província quando o destino é o Japão', async () => {
    const res = resposta();
    await handleCreate(pedido('Japão', ''), res);

    // No Japão a província escolhe a zona de frete doméstico — sem ela o
    // cálculo não existe, então recusar continua correto.
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_request' });
  });
});
