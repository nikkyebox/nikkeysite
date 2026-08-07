// O botão do perfil e o link do rodapé do e-mail precisam mexer no MESMO
// registro. Antes o perfil gravava `whatsappMarketing`, que nenhum endpoint de
// envio consultava: o cliente desligava, via "❌ Desativado" na tela e continuava
// recebendo promoção — o pior dos dois mundos, porque ele parava de procurar
// outra saída.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verificarToken: vi.fn(),
  limitar: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
}));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));

vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => ({ verifyIdToken: mocks.verificarToken }),
  adminDb: () => ({
    collection: (nome) => ({ doc: (id) => ({ set: (d, o) => mocks.set(nome, id, d, o), get: mocks.get }) }),
  }),
}));

const { handleEmailPreference } = await import('../notify.js');
const { optOutId } = await import('./email-optout.js');

function resposta() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; },
  };
}

const CLIENTE = 'cliente@exemplo.com';

async function chamar(method, body) {
  const res = resposta();
  await handleEmailPreference({
    method,
    headers: { authorization: 'Bearer token-valido' },
    query: { action: 'email-preference' },
    ...(body ? { body } : {}),
  }, res);
  return res;
}

beforeEach(() => {
  mocks.verificarToken.mockReset().mockResolvedValue({ uid: 'uid1', email: CLIENTE });
  mocks.limitar.mockReset().mockResolvedValue(undefined);
  mocks.set.mockReset().mockResolvedValue(undefined);
  mocks.get.mockReset().mockResolvedValue({ data: () => undefined });
});

describe('preferência de e-mail do perfil', () => {
  it('lê o mesmo registro que o link do rodapé grava', async () => {
    mocks.get.mockResolvedValue({ data: () => ({ email: CLIENTE, optedOut: true }) });

    const res = await chamar('GET');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, subscribed: false });
  });

  it('sem registro, o cliente está inscrito', async () => {
    const res = await chamar('GET');

    expect(res.body).toEqual({ ok: true, subscribed: true });
  });

  it('desligar grava opt-out no documento do próprio endereço', async () => {
    const res = await chamar('POST', { subscribed: false });

    expect(res.body).toEqual({ ok: true, subscribed: false });
    const [colecao, id, dados] = mocks.set.mock.calls[0];
    expect(colecao).toBe('email_optout');
    expect(id).toBe(optOutId(CLIENTE));
    expect(dados).toMatchObject({ email: CLIENTE, optedOut: true, source: 'profile' });
  });

  it('religar apaga o opt-out', async () => {
    await chamar('POST', { subscribed: true });

    expect(mocks.set.mock.calls[0][2]).toMatchObject({ email: CLIENTE, optedOut: false });
  });

  // O endereço vem do token, nunca do corpo: aceitar um `email` do cliente
  // deixaria qualquer conta descadastrar qualquer outra.
  it('recusa campos extras no corpo', async () => {
    const res = await chamar('POST', { subscribed: false, email: 'vitima@exemplo.com' });

    expect(res.statusCode).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('recusa valor que não seja booleano', async () => {
    const res = await chamar('POST', { subscribed: 'nao' });

    expect(res.statusCode).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('exige sessão', async () => {
    mocks.verificarToken.mockRejectedValue(new Error('token invalido'));

    const res = await chamar('GET');

    expect(res.statusCode).toBe(401);
  });

  // A sessão anônima do checkout não tem endereço — não há preferência a salvar.
  it('recusa sessão sem e-mail', async () => {
    mocks.verificarToken.mockResolvedValue({ uid: 'anon', email: undefined });

    const res = await chamar('POST', { subscribed: false });

    expect(res.statusCode).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
