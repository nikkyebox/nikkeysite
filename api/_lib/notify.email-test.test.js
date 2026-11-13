// E-mail de teste do painel Admin. A garantia que importa: o destinatario e
// SEMPRE o e-mail do admin autenticado — o navegador nao escolhe para quem vai,
// senao o botao viraria um relay aberto no dominio da loja.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from './http.js';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  requireAdmin: vi.fn(),
  limitar: vi.fn(),
}));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: mocks.limitar }));
vi.mock('./firebase-admin.js', () => ({ adminAuth: () => ({}), adminDb: () => ({}) }));
vi.mock('./auth.js', () => ({ requireAdmin: mocks.requireAdmin, requireUser: vi.fn() }));
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

const pedir = (body) => ({ method: 'POST', headers: {}, body });

describe('email test (admin)', () => {
  beforeEach(() => {
    mocks.sendMail.mockReset().mockResolvedValue({ id: 'email_1' });
    mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'adm1', email: 'Admin@Loja.jp' });
    mocks.limitar.mockReset().mockResolvedValue(undefined);
  });

  it('envia para o e-mail do admin logado', async () => {
    const res = resposta();
    await handleEmail(pedir({ type: 'test' }), res);

    expect(res.statusCode).toBe(200);
    const enviado = mocks.sendMail.mock.calls[0][0];
    expect(enviado.to).toBe('admin@loja.jp');
    expect(enviado.subject).toMatch(/Teste de envio/);
    expect(mocks.limitar.mock.calls[0][1].scope).toBe('email:test');
  });

  it('recusa destinatario vindo do navegador', async () => {
    const res = resposta();
    await handleEmail(pedir({ type: 'test', to: 'vitima@exemplo.com' }), res);

    expect(res.statusCode).toBe(400);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('exige admin', async () => {
    mocks.requireAdmin.mockRejectedValue(new HttpError(403, 'forbidden'));
    const res = resposta();
    await handleEmail(pedir({ type: 'test' }), res);

    expect(res.statusCode).toBe(403);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
