// Cancelamento de inscrição pelo link do e-mail.
//
// Até aqui nenhum e-mail de marketing tinha saída: o único jeito de parar de
// receber era entrar na conta e achar o botão no perfil. Quem não tem conta, ou
// não lembra da senha, só tinha a alternativa de marcar como spam — que num
// domínio novo derruba a entrega de TODO mundo, inclusive a confirmação de
// pedido.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  // Firestore de mentira, mas com estado: é o que permite provar que o botão do
  // perfil LÊ o que o link do e-mail gravou. Dois stubs independentes passariam
  // mesmo se os dois caminhos escrevessem em coleções diferentes.
  banco: new Map(),
  sessao: { uid: 'uid1', email: 'cliente@exemplo.com' },
}));

vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => ({ verifyIdToken: async () => mocks.sessao }),
  adminDb: () => ({
    collection: (colecao) => ({
      doc: (id) => ({
        __chave: `${colecao}/${id}`,
        async set(dados, opcoes) {
          mocks.set(colecao, id, dados, opcoes);
          mocks.banco.set(`${colecao}/${id}`, dados);
        },
        async get() {
          const dados = mocks.banco.get(`${colecao}/${id}`);
          return { exists: dados !== undefined, data: () => dados };
        },
      }),
    }),
    async getAll(...refs) {
      return refs.map((ref) => {
        const dados = mocks.banco.get(ref.__chave);
        return { exists: dados !== undefined, data: () => dados };
      });
    },
  }),
}));

vi.mock('./rate-limit.js', () => ({ enforceRateLimit: vi.fn() }));

const { decodeEmail, encodeEmail, unsubscribeToken, verifyUnsubscribeToken } = await import('./email-optout.js');
const { default: handler } = await import('../public-forms.js');
const { handleEmailPreference } = await import('../notify.js');

function resposta() {
  return {
    statusCode: 200, body: '', headers: {},
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(v) { this.body = v; return this; },
    end(v) { this.body = v ?? ''; return this; },
  };
}

const CLIENTE = 'cliente@exemplo.com';

/** Requisição igual à que chega depois do rewrite de `/api/unsubscribe`. */
async function chamar(method, { email = CLIENTE, token, a } = {}) {
  const res = resposta();
  await handler({
    method,
    headers: {},
    query: {
      action: 'unsubscribe',
      e: encodeEmail(email),
      t: token ?? unsubscribeToken(email),
      ...(a ? { a } : {}),
    },
  }, res);
  return res;
}

beforeEach(() => {
  mocks.set.mockReset();
  mocks.banco.clear();
  mocks.sessao = { uid: 'uid1', email: CLIENTE };
  process.env.UNSUBSCRIBE_SECRET = 'segredo-de-teste';
});

describe('assinatura do link', () => {
  it('aceita o token do próprio endereço', () => {
    expect(verifyUnsubscribeToken(CLIENTE, unsubscribeToken(CLIENTE))).toBe(true);
  });

  // Sem assinatura, trocar o `e=` da URL descadastraria qualquer cliente da
  // loja — bastaria adivinhar o endereço.
  it('recusa o token de outro endereço', () => {
    expect(verifyUnsubscribeToken('outro@exemplo.com', unsubscribeToken(CLIENTE))).toBe(false);
  });

  it('recusa token adulterado ou ausente', () => {
    expect(verifyUnsubscribeToken(CLIENTE, `${unsubscribeToken(CLIENTE)}x`)).toBe(false);
    expect(verifyUnsubscribeToken(CLIENTE, '')).toBe(false);
    expect(verifyUnsubscribeToken(CLIENTE, undefined)).toBe(false);
  });

  it('não vale mais quando o segredo muda', () => {
    const antigo = unsubscribeToken(CLIENTE);
    process.env.UNSUBSCRIBE_SECRET = 'outro-segredo';
    expect(verifyUnsubscribeToken(CLIENTE, antigo)).toBe(false);
  });

  // `cliente+promo@gmail.com` percent-encoded vira `cliente promo@gmail.com`
  // em vários clientes de e-mail e scanners: o endereço chegaria errado e
  // ninguém seria descadastrado.
  it('preserva o "+" dos apelidos do Gmail', () => {
    expect(decodeEmail(encodeEmail('cliente+promo@gmail.com'))).toBe('cliente+promo@gmail.com');
  });
});

describe('endpoint de cancelamento', () => {
  // Outlook, Proofpoint e afins abrem TODO link do corpo da mensagem para
  // varredura. Se o GET cancelasse, a lista se esvaziaria sozinha.
  it('GET só confirma — não grava nada', async () => {
    const res = await chamar('GET');

    expect(res.statusCode).toBe(200);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(res.headers['Content-Type']).toMatch(/text\/html/);
    expect(res.body).toContain('Cancelar inscrição');
    expect(res.body).toContain('method="post"');
  });

  it('POST cancela a inscrição do endereço assinado', async () => {
    const res = await chamar('POST');

    expect(res.statusCode).toBe(200);
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set.mock.calls[0][2]).toMatchObject({ email: CLIENTE, optedOut: true });
    expect(res.body).toContain('cancelada');
  });

  it('POST com a=on volta a inscrever', async () => {
    await chamar('POST', { a: 'on' });

    expect(mocks.set.mock.calls[0][2]).toMatchObject({ email: CLIENTE, optedOut: false });
  });

  it('token inválido não grava e responde 400 em HTML', async () => {
    const res = await chamar('POST', { token: 'token-forjado' });

    expect(res.statusCode).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(res.headers['Content-Type']).toMatch(/text\/html/);
  });

  // `normalizeEmail` aceita `<script>@x.co`: não tem espaço e tem um @ só.
  it('escapa o endereço antes de devolvê-lo na página', async () => {
    const res = await chamar('GET', { email: '<script>alert(1)</script>@x.co' });

    expect(res.body).not.toContain('<script>');
    expect(res.body).toContain('&lt;script&gt;');
  });

  it('a página não é indexada nem cacheada', async () => {
    const res = await chamar('GET');

    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['X-Robots-Tag']).toBe('noindex');
  });
});

// O motivo de tudo isto existir: antes o perfil mexia numa flag
// (`whatsappMarketing`) que nenhum endpoint de envio consultava, então os dois
// controles diziam coisas diferentes e nenhum dos dois parava e-mail.
describe('perfil e link do e-mail são o mesmo registro', () => {
  async function preferencia(method, body) {
    const res = resposta();
    await handleEmailPreference({
      method,
      headers: { authorization: 'Bearer token' },
      query: { action: 'email-preference' },
      ...(body ? { body } : {}),
    }, res);
    return res;
  }

  it('cancelou pelo e-mail → o perfil mostra desativado', async () => {
    await chamar('POST');

    expect((await preferencia('GET')).body).toEqual({ ok: true, subscribed: false });
  });

  it('religou no perfil → o link do e-mail passa a ver inscrito', async () => {
    await chamar('POST');
    await preferencia('POST', { subscribed: true });

    expect((await preferencia('GET')).body).toEqual({ ok: true, subscribed: true });
    expect(mocks.banco.get(`email_optout/${(await import('./email-optout.js')).optOutId(CLIENTE)}`))
      .toMatchObject({ email: CLIENTE, optedOut: false });
  });

  it('desligou no perfil → a campanha para de enviar para ele', async () => {
    const { optedOutAmong } = await import('./email-optout.js');
    await preferencia('POST', { subscribed: false });

    expect(await optedOutAmong([CLIENTE, 'outro@exemplo.com'])).toEqual(new Set([CLIENTE]));
  });
});
