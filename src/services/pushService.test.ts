// A notificação sumia sem ninguém saber.
//
// O registro do service worker de push vive em escopo próprio ('/push/') e pode
// desaparecer: era o que a recuperação de chunk error fazia a cada deploy, e
// limpar dados do site tem o mesmo efeito. Quando isso acontece, TODAS as pontas
// mentem: o documento continua em `push_subscriptions`, o painel conta o cliente
// em "vão receber push de verdade", o provedor aceita o envio com HTTP 201 — e
// nada aparece na tela. Medido no Chrome da dona: `sw.js` com 718 referências no
// banco de service workers, `push-sw.js` com ZERO.
//
// `resync` reconcilia navegador ↔ Firestore no carregamento do app. Estes testes
// travam as duas regras que importam: reinscrever quando o registro se perdeu, e
// NUNCA pedir permissão por conta própria.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  // Parâmetros tipados aqui para o teste ler `mock.calls` sem asserção de tipo.
  setDoc: vi.fn(async (_ref: unknown, _dados: Record<string, unknown>) => undefined),
  deleteDoc: vi.fn(async () => undefined),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  getRegistration: vi.fn(),
  register: vi.fn(),
  subscribe: vi.fn(),
  getSubscription: vi.fn(),
  requestPermission: vi.fn(async () => 'granted' as NotificationPermission),
}));

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, firebaseConfigReady: true }));
vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  setDoc: mocks.setDoc,
  deleteDoc: mocks.deleteDoc,
  serverTimestamp: () => 'agora',
}));

const INSCRICAO = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(async () => true),
};

function encenarNavegador({ registroExiste, inscricaoExiste }: { registroExiste: boolean; inscricaoExiste: boolean }) {
  mocks.getSubscription.mockResolvedValue(inscricaoExiste ? INSCRICAO : null);
  mocks.subscribe.mockResolvedValue(INSCRICAO);
  const registro = { pushManager: { getSubscription: mocks.getSubscription, subscribe: mocks.subscribe } };
  mocks.getRegistration.mockResolvedValue(registroExiste ? registro : undefined);
  mocks.register.mockResolvedValue(registro);
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: mocks.getRegistration, register: mocks.register, ready: Promise.resolve(registro) },
  });
  vi.stubGlobal('PushManager', function PushManager() {});
}

function encenarPermissao(permission: NotificationPermission) {
  vi.stubGlobal('Notification', { permission, requestPermission: mocks.requestPermission });
}

const CLIENTE = { email: 'Cliente@Exemplo.com', name: 'Cliente' };

// `import()` dentro do teste, e não no topo: `pushService` lê
// `VITE_VAPID_PUBLIC_KEY` no escopo do módulo, então o import precisa acontecer
// DEPOIS de `vi.stubEnv` — com import estático a chave chegaria vazia e
// `isPushSupported()` devolveria false em todos os casos.
describe('pushService.resync', () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    localStorage.clear();
    for (const m of Object.values(mocks)) if (typeof m.mockClear === 'function') m.mockClear();
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM');
  });

  it('reinscreve o aparelho quando o registro de push se perdeu', async () => {
    encenarPermissao('granted');
    encenarNavegador({ registroExiste: false, inscricaoExiste: false });
    const { pushService } = await import('@/services/pushService');

    const r = await pushService.resync(CLIENTE);

    expect(mocks.register).toHaveBeenCalledWith('/push-sw.js', { scope: '/push/' });
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: true, recriada: true });
    // E o documento volta a existir, com o e-mail normalizado.
    const [, dados] = mocks.setDoc.mock.calls.at(-1) ?? [null, {}];
    expect(dados.customerEmail).toBe('cliente@exemplo.com');
    expect(dados.endpoint).toBe(INSCRICAO.endpoint);
  });

  it('inscrição viva é apenas revalidada, sem criar outra', async () => {
    encenarPermissao('granted');
    encenarNavegador({ registroExiste: true, inscricaoExiste: true });
    const { pushService } = await import('@/services/pushService');

    const r = await pushService.resync(CLIENTE);

    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, recriada: false });
    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
  });

  it('NUNCA pede permissão por conta própria', async () => {
    encenarPermissao('default');
    encenarNavegador({ registroExiste: false, inscricaoExiste: false });
    const { pushService } = await import('@/services/pushService');

    const r = await pushService.resync(CLIENTE);

    expect(mocks.requestPermission).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it('permissão bloqueada não gera escrita nenhuma', async () => {
    encenarPermissao('denied');
    encenarNavegador({ registroExiste: true, inscricaoExiste: false });
    const { pushService } = await import('@/services/pushService');

    await pushService.resync(CLIENTE);

    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});

describe('documento por aparelho', () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    localStorage.clear();
    for (const m of Object.values(mocks)) if (typeof m.mockClear === 'function') m.mockClear();
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM');
    encenarPermissao('granted');
  });

  it('reinscrever no mesmo aparelho reaproveita o documento, não cria um segundo', async () => {
    encenarNavegador({ registroExiste: true, inscricaoExiste: true });
    const { pushService } = await import('@/services/pushService');

    await pushService.subscribe(CLIENTE);
    // Endpoint novo é o que acontece quando o navegador refaz a inscrição.
    mocks.getSubscription.mockResolvedValue(null);
    mocks.subscribe.mockResolvedValue({ ...INSCRICAO, endpoint: 'https://fcm.googleapis.com/fcm/send/OUTRO' });
    await pushService.subscribe(CLIENTE);

    const ids = mocks.doc.mock.calls.map(([, , id]) => id);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(/^dev-/);
  });
});
