// Contrato do envio de e-mail: nunca reportar sucesso sem entrega.
//
// O caso que motivou este arquivo: o SMTP aceita a conexão, recusa o
// destinatário, e o `sendMail` do nodemailer resolve normalmente com o
// endereço dentro de `rejected`. Sem checar isso, o endpoint respondia 200 e o
// cadastro do cliente ficava travado esperando um e-mail que nunca saiu — sem
// erro em lugar nenhum.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const sendMailMock = vi.fn();
const transportesCriados = [];

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (opcoes) => {
      transportesCriados.push(opcoes);
      return { sendMail: sendMailMock };
    },
  },
}));

const { sendMail, unsubscribeUrl, wrapEmail, MAIL_FROM } = await import('./mailer.js');

const CARTA = { to: 'cliente@exemplo.com', subject: 'Confirme seu e-mail', html: '<p>oi</p>' };

describe('sendMail', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    process.env.NOREPLY_EMAIL_PASSWORD = 'senha-de-teste';
  });

  it('devolve o resultado quando o destinatário é aceito', async () => {
    sendMailMock.mockResolvedValue({ accepted: ['cliente@exemplo.com'], rejected: [], messageId: '<abc@mail>' });

    const r = await sendMail(CARTA);

    expect(r.accepted).toEqual(['cliente@exemplo.com']);
    expect(r.messageId).toBe('<abc@mail>');
  });

  it('falha quando o SMTP recusa o destinatário', async () => {
    sendMailMock.mockResolvedValue({ accepted: [], rejected: ['cliente@exemplo.com'], messageId: '<abc@mail>' });

    await expect(sendMail(CARTA)).rejects.toMatchObject({ code: 'email_rejected_by_smtp' });
  });

  it('falha quando ninguém é aceito, mesmo sem recusa explícita', async () => {
    sendMailMock.mockResolvedValue({ accepted: [], rejected: [], messageId: '<abc@mail>' });

    await expect(sendMail(CARTA)).rejects.toMatchObject({ code: 'email_rejected_by_smtp' });
  });

  it('falha claramente quando falta a credencial de SMTP', async () => {
    delete process.env.NOREPLY_EMAIL_PASSWORD;
    delete process.env.GMAIL_APP_PASSWORD;

    await expect(sendMail(CARTA)).rejects.toMatchObject({ code: 'email_not_configured' });
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
describe('alternativa em texto puro', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ accepted: ['cliente@exemplo.com'], rejected: [], messageId: '<x>' });
    process.env.NOREPLY_EMAIL_PASSWORD = 'senha-de-teste';
  });

  it('acompanha o HTML em toda mensagem', async () => {
    await sendMail({ ...CARTA, html: '<p>Ola, <strong>Maria</strong>.</p>' });

    const enviado = sendMailMock.mock.calls[0][0];
    expect(enviado.text).toBeTruthy();
    expect(enviado.html).toBeTruthy();
    expect(enviado.text).not.toMatch(/<[a-z]/i);
    expect(enviado.text).toContain('Ola, Maria.');
  });

  // Sem isto o e-mail de confirmação chega vazio para quem lê em texto puro:
  // o botão vira uma palavra solta e o link some.
  it('preserva a URL de confirmação, não só o rótulo do botão', async () => {
    const link = 'https://nikkeybox-store.com/__/auth/action?mode=verifyEmail&oobCode=ABC123';
    await sendMail({ ...CARTA, html: `<p><a href="${link}">Confirmar meu e-mail</a></p>` });

    const { text } = sendMailMock.mock.calls[0][0];
    expect(text).toContain(link);
    expect(text).toContain('Confirmar meu e-mail');
  });
});

// O rodapé é a única saída de quem não tem conta na loja (lead capturado no
// popup de saída) ou não lembra da senha. Sem ele, o caminho que sobra é marcar
// como spam — e num domínio novo isso derruba a entrega de tudo, inclusive a
// confirmação de pedido.
describe('cancelamento de inscrição', () => {
  const ENDERECO = 'cliente@exemplo.com';

  beforeEach(() => {
    sendMailMock.mockReset().mockResolvedValue({ accepted: [ENDERECO], rejected: [], messageId: '<x>' });
    process.env.NOREPLY_EMAIL_PASSWORD = 'senha-de-teste';
    process.env.UNSUBSCRIBE_SECRET = 'segredo-de-teste';
  });

  it('o link do rodapé chega inteiro, inclusive em texto puro', async () => {
    const url = unsubscribeUrl(ENDERECO);

    await sendMail({ ...CARTA, html: wrapEmail('<p>oferta</p>', { unsubscribeUrl: url }), unsubscribe: url });

    const { html, text } = sendMailMock.mock.calls[0][0];
    expect(html).toContain(url.replace(/&/g, '&amp;'));
    expect(text).toContain('Cancelar inscricao');
    expect(text).toContain(url);
  });

  // É o que faz o Gmail e o Outlook mostrarem o botão nativo ao lado do
  // remetente — o caminho que a maioria usa, em vez de rolar até o rodapé.
  it('anuncia o cancelamento em um clique (RFC 8058)', async () => {
    const url = unsubscribeUrl(ENDERECO);

    await sendMail({ ...CARTA, html: '<p>oferta</p>', unsubscribe: url });

    const { headers } = sendMailMock.mock.calls[0][0];
    expect(headers['List-Unsubscribe']).toBe(`<${url}>`);
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  // Confirmação de pedido, rastreio e redefinição de senha não são divulgação:
  // a loja precisa mandar de qualquer forma. Oferecer "cancelar inscrição"
  // neles prometeria algo que não dá para cumprir.
  it('e-mail transacional não ganha rodapé nem cabeçalho', async () => {
    await sendMail({ ...CARTA, html: wrapEmail('<p>Pedido recebido</p>') });

    const enviado = sendMailMock.mock.calls[0][0];
    expect(enviado.html).not.toMatch(/cancelar inscricao/i);
    expect(enviado.headers).toBeUndefined();
  });
});

// `noreply@` virou alias da conta principal no Workspace, e alias não autentica
// no Gmail: só caixa real tem senha. O login estava fixo em `MAIL_FROM`, então
// TODO envio passou a morrer em 535 — com "Enviar como" corretamente
// configurado, porque isso governa o `From`, não a autenticação. Além disso o
// EAUTH subia como erro desconhecido e o painel só dizia "internal_error".
describe('login SMTP separado do remetente', () => {
  beforeEach(() => {
    sendMailMock.mockReset().mockResolvedValue({ accepted: ['cliente@exemplo.com'], rejected: [], messageId: '<x>' });
    transportesCriados.length = 0;
    process.env.NOREPLY_EMAIL_PASSWORD = 'senha-de-teste';
    delete process.env.SMTP_USER;
  });

  it('autentica com SMTP_USER e mantém o remetente visível', async () => {
    process.env.SMTP_USER = 'shiokawa@nikkeybox-store.com';

    await sendMail(CARTA);

    expect(transportesCriados.at(-1).auth.user).toBe('shiokawa@nikkeybox-store.com');
    expect(sendMailMock.mock.calls.at(-1)[0].from).toContain(MAIL_FROM);
  });

  it('sem SMTP_USER, autentica no próprio remetente (instalação antiga)', async () => {
    await sendMail(CARTA);

    expect(transportesCriados.at(-1).auth.user).toBe(MAIL_FROM);
  });

  it('credencial recusada chega ao painel como email_auth_failed, não erro interno', async () => {
    sendMailMock.mockRejectedValue(Object.assign(new Error('535-5.7.8 Username and Password not accepted'), {
      code: 'EAUTH', responseCode: 535,
    }));

    await expect(sendMail(CARTA)).rejects.toMatchObject({ statusCode: 503, code: 'email_auth_failed' });
  });

  it('erro que não é de credencial continua subindo como ele mesmo', async () => {
    sendMailMock.mockRejectedValue(Object.assign(new Error('sem rede'), { code: 'ECONNECTION' }));

    await expect(sendMail(CARTA)).rejects.toThrow(/sem rede/);
  });
});
