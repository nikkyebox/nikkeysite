// Contrato do envio de e-mail: nunca reportar sucesso sem entrega, e sempre
// devolver ao chamador um erro que ele consiga agir (não "internal_error").
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function Resend() {
    return { emails: { send: mocks.send } };
  }),
}));
const { sendMail, unsubscribeUrl, wrapEmail, MAIL_FROM } = await import('./mailer.js');

const CARTA = { to: 'cliente@exemplo.com', subject: 'Confirme seu e-mail', html: '<p>oi</p>' };

describe('sendMail', () => {
  beforeEach(() => {
    mocks.send.mockReset();
    process.env.RESEND_API_KEY = 're_teste';
  });

  it('devolve o resultado quando o Resend aceita o envio', async () => {
    mocks.send.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    const resultado = await sendMail(CARTA);
    expect(resultado).toMatchObject({ accepted: ['cliente@exemplo.com'], rejected: [], messageId: 'msg_123' });
  });

  it('usa o remetente e reply-to configurados, nunca um alias solto', async () => {
    mocks.send.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    await sendMail(CARTA);
    const enviado = mocks.send.mock.calls[0][0];
    expect(enviado.from).toBe(MAIL_FROM);
    expect(enviado.replyTo).toBe(MAIL_FROM);
    expect(enviado.to).toBe('cliente@exemplo.com');
  });

  it('falha como email_validation_failed quando o Resend recusa por validação', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: 'validation_error: invalid to' } });
    await expect(sendMail(CARTA)).rejects.toMatchObject({ code: 'email_validation_failed', statusCode: 400 });
  });

  it('falha como email_send_failed para qualquer outro erro do Resend', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: 'internal_server_error' } });
    await expect(sendMail(CARTA)).rejects.toMatchObject({ code: 'email_send_failed', statusCode: 503 });
  });

  it('falha claramente quando falta a API key do Resend', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendMail(CARTA)).rejects.toMatchObject({ code: 'email_service_not_configured', statusCode: 503 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('alternativa em texto puro', () => {
  beforeEach(() => {
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    process.env.RESEND_API_KEY = 're_teste';
  });

  it('acompanha o HTML em toda mensagem', async () => {
    await sendMail({ ...CARTA, html: '<p>Ola, <strong>Maria</strong>.</p>' });
    const enviado = mocks.send.mock.calls[0][0];
    expect(enviado.text).toBeTruthy();
    expect(enviado.text).toContain('Ola, Maria.');
  });

  it('remove tags e preserva a URL do link, não só o rótulo do botão', async () => {
    await sendMail({
      ...CARTA,
      html: '<p>Confirme seu e-mail: <a href="https://nikkeybox.jp/confirm?code=ABC123">Confirmar meu e-mail</a></p>',
    });
    const { text } = mocks.send.mock.calls[0][0];
    expect(text).toContain('Confirmar meu e-mail');
    expect(text).toContain('https://nikkeybox.jp/confirm?code=ABC123');
  });
});

// O rodapé é a única saída de quem não tem conta na loja (lead capturado no
// popup de saída) ou não lembra da senha. Sem ele, o caminho que sobra é marcar
// como spam — e num domínio novo isso derruba a entrega de tudo, inclusive a
// confirmação de pedido.
describe('cancelamento de inscrição', () => {
  const ENDERECO = 'cliente@exemplo.com';

  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = 'segredo-de-teste';
  });

  it('gera uma URL nova a cada chamada, com o mesmo endereço', () => {
    const url = unsubscribeUrl(ENDERECO);
    expect(url).toContain('/api/unsubscribe');
    expect(url).toMatch(/[?&]e=/);
    expect(url).toMatch(/[?&]t=/);
  });

  it('wrapEmail inclui o link quando recebe unsubscribeUrl', () => {
    const url = unsubscribeUrl(ENDERECO);
    const html = wrapEmail('<p>Novo produto chegou.</p>', { unsubscribeUrl: url });
    expect(html).toContain('Cancelar inscri');
    expect(html).toContain(url.replace(/&/g, '&amp;'));
  });

  it('e-mail transacional não ganha rodapé de cancelamento', () => {
    const html = wrapEmail('<p>Pedido recebido.</p>');
    expect(html).not.toContain('Cancelar inscri');
  });

  it('inclui os headers List-Unsubscribe quando sendMail recebe unsubscribe', async () => {
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    process.env.RESEND_API_KEY = 're_teste';
    const url = unsubscribeUrl(ENDERECO);
    await sendMail({ ...CARTA, unsubscribe: url });
    const { headers } = mocks.send.mock.calls[0][0];
    expect(headers['List-Unsubscribe']).toBe(`<${url}>`);
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
