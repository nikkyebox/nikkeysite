// Cada estágio cria o cupom antes de enviar o e-mail. Assim o cliente nunca
// recebe um código prometido que não existe no Firestore.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  set: vi.fn(),
  getUser: vi.fn(),
  docs: [],
  cupomExistente: undefined,
  cancelouInscricao: false,
}));

vi.mock('./auth.js', () => ({ requireCronSecret: vi.fn() }));

vi.mock('./email-optout.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isOptedOut: async () => mocks.cancelouInscricao,
}));

vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => ({ getUser: mocks.getUser }),
  adminDb: () => {
    const collection = {
      doc: () => ({ set: mocks.set, get: async () => ({ data: () => mocks.cupomExistente }) }),
      where() { return this; },
      limit() { return this; },
      get: async () => ({ docs: mocks.docs, size: mocks.docs.length }),
    };
    return {
      collection: () => collection,
      runTransaction: async (fn) => fn({
        get: async (ref) => ({ data: () => ref.__dados }),
        update: () => {},
      }),
    };
  },
}));
vi.mock('./mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendMail: mocks.sendMail,
}));


const { default: handler } = await import('../cart-recovery.js');

function resposta() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; },
  };
}

/** Carrinho abandonado há `horas`, já tendo recebido `estagio` lembretes. */
function carrinho(horas, estagio, ultimoEnvioHoras = null) {
  const dados = {
    abandonedAt: Date.now() - horas * 3600000,
    reminderStage: estagio,
    items: [{ name: 'Pocky', quantity: 2 }],
    ...(ultimoEnvioHoras == null ? {} : { reminderSentAt: Date.now() - ultimoEnvioHoras * 3600000 }),
  };
  const ref = { __dados: dados, update: vi.fn().mockResolvedValue(undefined) };
  return { id: 'uid1', ref, data: () => dados };
}

async function rodar(horas, estagio, ultimoEnvioHoras = null) {
  mocks.docs = [carrinho(horas, estagio, ultimoEnvioHoras)];
  const res = resposta();
  await handler({ method: 'GET', headers: {} }, res);
  return res;
}

describe('recuperação de carrinho', () => {
  beforeEach(() => {
    mocks.sendMail.mockReset().mockResolvedValue({ accepted: ['x'] });
    mocks.set.mockReset().mockResolvedValue(undefined);
    mocks.getUser.mockReset().mockResolvedValue({ email: 'cliente@exemplo.com', displayName: 'Ana' });
    mocks.cupomExistente = undefined;
    mocks.cancelouInscricao = false;
    process.env.UNSUBSCRIBE_SECRET = 'segredo-de-teste';
  });

  it('inicia com 10% somente depois de três dias', async () => {
    await rodar(24 * 3, 0);

    const cupom = mocks.set.mock.calls[0][0];
    expect(cupom.discountPercent).toBe(10);
    expect(mocks.sendMail.mock.calls[0][0].subject).toMatch(/10% OFF/);
  });

  it('oferece 30% só no último toque, a 9 dias', async () => {
    await rodar(24 * 10, 2); // 10 dias, já recebeu 10% e 15%

    const cupom = mocks.set.mock.calls[0][0];
    expect(cupom.discountPercent).toBe(30);
    const { subject, html } = mocks.sendMail.mock.calls[0][0];
    expect(subject).toMatch(/30% OFF/);
    expect(html).toContain(cupom.code);
  });

  it('o cupom é criado ANTES de prometer o código no e-mail', async () => {
    await rodar(24 * 10, 2);

    // Era exatamente o bug do VOLTA10: e-mail com código que não existia.
    const ordemCriacao = mocks.set.mock.invocationCallOrder[0];
    const ordemEnvio = mocks.sendMail.mock.invocationCallOrder[0];
    expect(ordemCriacao).toBeLessThan(ordemEnvio);
  });

  it('o cupom vale para o CARRINHO INTEIRO, não para um produto', async () => {
    await rodar(24 * 10, 2);

    const c = mocks.set.mock.calls[0][0];
    // Campanha de produto carrega `productId` e o servidor a restringe a ele.
    // O cupom de recuperação não tem — incide sobre o pedido todo.
    expect(c.productId).toBeUndefined();
    expect(c.type).toBe('percent');
  });

  it('usa código individual e legível, liberado só para quem recebeu o e-mail', async () => {
    await rodar(24 * 10, 2);

    const c = mocks.set.mock.calls[0][0];
    expect(c.code).toMatch(/^CARRINHO30-[A-F0-9]{10}$/);
    expect(c.targetEmails).toEqual(['cliente@exemplo.com']);
    expect(c.targetType).toBe('specific');
  });
  
  it('espera três dias reais entre os e-mails de desconto', async () => {
    await rodar(24 * 10, 1, 24);
    expect(mocks.sendMail).not.toHaveBeenCalled();

    await rodar(24 * 10, 1, 24 * 3);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.set.mock.calls[0][0].discountPercent).toBe(15);
  });

  it('o prazo acompanha o envio — 24h para finalizar', async () => {
    await rodar(24 * 10, 2);

    const c = mocks.set.mock.calls[0][0];
    const horas = (new Date(c.expiryDate).getTime() - Date.now()) / 3600000;
    expect(horas).toBeGreaterThan(23);
    expect(horas).toBeLessThan(25);
  });

  it('não envia nada se o cupom não puder ser criado', async () => {
    mocks.set.mockRejectedValue(new Error('firestore fora'));

    const res = await rodar(24 * 10, 2);

    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(res.body.sent).toBe(0);
  });

  it('não avança de estágio antes da hora', async () => {
    await rodar(24 * 2, 0); // 2 dias < primeiro envio, no terceiro dia

    expect(mocks.sendMail).not.toHaveBeenCalled();
  });


  it('encerra a sequência depois do cupom de 30%', async () => {
    await rodar(24 * 30, 3, 24 * 20);

    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('todo lembrete carrega a saída para parar de receber', async () => {
    await rodar(24 * 10, 2);

    const { html, unsubscribe } = mocks.sendMail.mock.calls[0][0];
    expect(unsubscribe).toMatch(/\/api\/unsubscribe\?e=[^&]+&t=.+/);
    expect(html).toContain('Cancelar inscricao');
  });

  // Sem tirar o carrinho da fila, o cron reavaliaria o mesmo documento todo dia
  // só para decidir de novo não enviar nada — e o cliente que já pediu para
  // parar continuaria custando leitura no Firestore para sempre.
  it('quem cancelou a inscrição não recebe nem volta na fila', async () => {
    mocks.cancelouInscricao = true;

    const res = await rodar(24 * 10, 2);

    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.docs[0].ref.update).toHaveBeenCalledWith(
      expect.objectContaining({ reminderStage: 3, reminderOptedOut: true }),
    );
    expect(res.body.sent).toBe(0);
  });

});
