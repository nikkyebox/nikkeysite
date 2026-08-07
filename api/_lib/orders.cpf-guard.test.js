// ALTO 3 do AUDITORIA.md, parte que dependia de decisão de negócio: o guarda
// "cupom 1× por cliente" era ancorado em e-mail, que o convidado troca de
// graça. A decisão foi trancar por CPF no Brasil e deixar como está fora dele.
//
// A trava só vale se o CPF existir sempre que deveria. O formulário de checkout
// já exigia (`Checkout.tsx` valida `isValidCPF` quando o país é Brasil), mas o
// SERVIDOR aceitava sem: quem chamasse a API direto, ou um bug de front,
// passava sem documento — e voltava a poder reusar o cupom trocando de e-mail.
//
// Fora do Brasil não há documento equivalente, então exigir seria barrar venda
// legítima. É por isso que a regra é por país e não global.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), limitar: vi.fn() }));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));
vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => ({ verifyIdToken: mocks.verify }),
  // A recusa acontece na validação do corpo, antes de qualquer leitura: se o
  // banco for tocado, é sinal de que o guarda não disparou onde deveria.
  adminDb: () => { throw new Error('nao deveria tocar o banco'); },
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

function pedido({ country, cpf }) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: {
      orderId: 'SC-JP-300001',
      items: [{ productId: 'p1', variantId: 'small', quantity: 1 }],
      country,
      prefecture: '',
      state: country === 'Brasil' ? 'SP' : '',
      shippingCarrier: 'ems',
      paymentMethod: 'wise',
      couponCode: '',
      redeemPoints: 0,
      negotiationId: '',
      promoCode: '',
      customer: {
        name: 'Cliente Teste', email: 'cliente@exemplo.com', phone: '', cpf,
        postalCode: '01310-100', city: 'Sao Paulo', address: 'Av Paulista 1000', building: '',
      },
    },
  };
}

beforeEach(() => {
  mocks.limitar.mockReset().mockResolvedValue(undefined);
  mocks.verify.mockReset().mockResolvedValue({ uid: 'u1', email: 'cliente@exemplo.com' });
});

describe('CPF obrigatório no destino Brasil', () => {
  it('recusa pedido para o Brasil sem CPF', async () => {
    const res = resposta();

    await handleCreate(pedido({ country: 'Brasil', cpf: '' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'cpf_required' });
  });

  // Um CPF de 10 dígitos não pode virar "sem CPF" e passar: `invalid_cpf` já
  // existia e continua sendo o erro certo, mais específico que `cpf_required`.
  it('recusa CPF malformado com o erro específico', async () => {
    const res = resposta();

    await handleCreate(pedido({ country: 'Brasil', cpf: '1234567890' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_cpf' });
  });

  // Portugal, Japão, EUA: não existe CPF e exigir barraria venda legítima.
  // O `adminDb` do mock lança, então chegar até o banco prova que passou da
  // validação — que é exatamente o que se quer aqui.
  it('deixa passar pedido de fora do Brasil sem CPF', async () => {
    const res = resposta();

    await handleCreate(pedido({ country: 'Portugal', cpf: '' }), res);

    expect(res.body).not.toEqual({ error: 'cpf_required' });
    expect(res.statusCode).not.toBe(400);
  });
});
