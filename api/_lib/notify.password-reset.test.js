// A recuperação de senha é o único tipo de e-mail que aceita requisição sem
// sessão — quem esqueceu a senha não consegue provar quem é. Isso a torna a
// superfície mais exposta da API, e estes testes fixam as duas garantias que
// isso exige: não revelar quem tem conta, e não deixar o endpoint virar
// ferramenta de spam.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from './http.js';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  gerarLink: vi.fn(),
  limitar: vi.fn(),
}));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));

vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => ({ generatePasswordResetLink: mocks.gerarLink }),
  adminDb: () => ({}),
}));

vi.mock('./mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendMail: mocks.sendMail,
}));

const { handleEmail } = await import('../notify.js');

function resposta() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(nome, valor) { this.headers[nome] = valor; },
    status(codigo) { this.statusCode = codigo; return this; },
    json(valor) { this.body = valor; return this; },
    end() { return this; },
  };
}

function pedir(to) {
  return { method: 'POST', headers: {}, body: { type: 'password-reset', to } };
}

describe('password-reset', () => {
  beforeEach(() => {
    mocks.sendMail.mockReset().mockResolvedValue({ accepted: ['x'] });
    mocks.gerarLink.mockReset().mockResolvedValue('https://link/reset?oob=abc');
    mocks.limitar.mockReset().mockResolvedValue(undefined);
  });

  it('envia pelo mailer da loja quando a conta existe', async () => {
    const res = resposta();
    await handleEmail(pedir('Cliente@Exemplo.com'), res);

    expect(res.statusCode).toBe(200);
    const enviado = mocks.sendMail.mock.calls[0][0];
    expect(enviado.to).toBe('cliente@exemplo.com');       // normalizado
    expect(enviado.subject).toMatch(/Redefinir sua senha/);
    expect(enviado.html).toContain('https://link/reset?oob=abc');
  });

  it('responde igual para conta inexistente — sem revelar quem tem cadastro', async () => {
    mocks.gerarLink.mockRejectedValue(Object.assign(new Error('nope'), { code: 'auth/user-not-found' }));
    const res = resposta();

    await handleEmail(pedir('ninguem@exemplo.com'), res);

    // Mesma resposta do caso bem-sucedido: é isso que impede a varredura.
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, type: 'password-reset' });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('não engole falha real de envio — o cliente precisa saber', async () => {
    mocks.sendMail.mockRejectedValue(new HttpError(502, 'email_rejected_by_smtp'));
    const res = resposta();

    await handleEmail(pedir('cliente@exemplo.com'), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'email_rejected_by_smtp' });
  });

  it('limita por IP e por e-mail, porque o endpoint é aberto', async () => {
    const res = resposta();
    await handleEmail(pedir('cliente@exemplo.com'), res);

    const escopos = mocks.limitar.mock.calls.map(([, opcoes]) => opcoes.scope);
    expect(escopos).toContain('email:password-reset:ip');
    expect(escopos).toContain('email:password-reset:conta');

    // O limite por IP não pode ter identidade: precisa cair no endereço de
    // origem, senão todos os pedidos compartilham o mesmo balde.
    const porIp = mocks.limitar.mock.calls.find(([, o]) => o.scope.endsWith(':ip'))[1];
    expect(porIp.identity).toBeUndefined();

    // O limite por conta usa o e-mail JÁ normalizado, senão trocar a caixa das
    // letras contornaria a proteção.
    const porConta = mocks.limitar.mock.calls.find(([, o]) => o.scope.endsWith(':conta'))[1];
    expect(porConta.identity).toBe('cliente@exemplo.com');
  });

  it('recusa campos extras no corpo', async () => {
    const res = resposta();
    await handleEmail({ method: 'POST', headers: {}, body: { type: 'password-reset', to: 'a@b.com', admin: true } }, res);

    expect(res.statusCode).toBe(400);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
