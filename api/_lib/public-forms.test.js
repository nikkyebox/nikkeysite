import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock('./mailer.js', () => ({
  MAIL_REPLY_TO: 'contato@example.com',
  sendMail: mocks.sendMail,
  siteOrigin: () => 'https://example.com',
  unsubscribeUrl: () => 'https://example.com/api/unsubscribe',
  wrapEmail: (html) => html,
}));
vi.mock('./push.js', () => ({ sendPush: mocks.sendPush }));

import { notifyStoreCustomRequest } from '../public-forms.js';

const previousOrderEmail = process.env.ORDER_NOTIFICATION_EMAIL;
const previousAdminEmail = process.env.ADMIN_EMAIL;

describe('notificação de pedido personalizado', () => {
  beforeEach(() => {
    process.env.ORDER_NOTIFICATION_EMAIL = 'admin@example.com';
    delete process.env.ADMIN_EMAIL;
    mocks.sendMail.mockReset().mockResolvedValue({ id: 'mail-1' });
    mocks.sendPush.mockReset().mockResolvedValue({ sent: 1 });
  });

  afterEach(() => {
    if (previousOrderEmail === undefined) delete process.env.ORDER_NOTIFICATION_EMAIL;
    else process.env.ORDER_NOTIFICATION_EMAIL = previousOrderEmail;
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
  });

  it('avisa o administrador por e-mail e push sem expor o produto na tela bloqueada', async () => {
    await notifyStoreCustomRequest({
      name: 'Ana',
      contact: 'ana@example.com',
      country: 'Brasil',
      productDesc: 'Produto confidencial <script>',
      referenceLink: 'https://loja.example/item',
      quantity: '2',
    });

    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@example.com',
      subject: 'Novo pedido personalizado — Ana',
      html: expect.stringContaining('Produto confidencial &lt;script&gt;'),
    }));
    expect(mocks.sendPush).toHaveBeenCalledWith({
      emails: ['admin@example.com'],
      title: 'Novo pedido personalizado',
      body: 'Ana enviou uma nova solicitação. Abra o painel para conferir.',
      url: '/admin',
      tag: 'custom-request',
    });
    expect(mocks.sendPush.mock.calls[0][0].body).not.toContain('Produto confidencial');
  });

  it('mantém o aviso ativo quando um dos canais falha', async () => {
    mocks.sendMail.mockRejectedValueOnce(new Error('smtp indisponível'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(notifyStoreCustomRequest({
      name: 'Bia',
      contact: 'bia@example.com',
      country: '',
      productDesc: 'Caneca',
      referenceLink: '',
      quantity: '1',
    })).resolves.toBeUndefined();

    expect(mocks.sendPush).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
