// Em 28/07/2026 o painel abria com "Não foi possível atualizar os dados
// consolidados" sempre que o navegador era fechado e aberto de novo, e o admin
// entendia que tinha sido deslogado — a sessão estava intacta em disco.
//
// `firebaseIdToken` lia `auth.currentUser` no primeiro instante do
// carregamento. Nesse instante o SDK ainda está restaurando a sessão do
// IndexedDB (restauração assíncrona), então `currentUser` é null e a função
// concluía "sem sessão" e nem chegava a chamar o endpoint. Quem dispara na
// montagem do painel (dashboard, relatório de cupons, lista de admins) falhava
// inteiro, sem nova tentativa.
//
// Este teste existe para que sessão-em-restauração nunca volte a ser tratada
// como sessão inexistente.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  currentUser: null as null | { getIdToken: (forceRefresh?: boolean) => Promise<string> },
  authStateReady: vi.fn(async () => {}),
}));

vi.mock('@/config/firebase', () => ({ auth: authMock }));

import { authenticatedFetch, firebaseIdToken } from '@/services/authenticatedFetch';

/** Estado real de um carregamento novo: sem usuário até a restauração terminar. */
function encenarRestauracao(token: string): void {
  authMock.currentUser = null;
  authMock.authStateReady.mockImplementation(async () => {
    await Promise.resolve();
    authMock.currentUser = { getIdToken: async () => token };
  });
}

/** Estado de quem realmente não tem sessão: resolve e continua sem usuário. */
function encenarSemSessao(): void {
  authMock.currentUser = null;
  authMock.authStateReady.mockImplementation(async () => {});
}

describe('firebaseIdToken', () => {
  beforeEach(() => {
    authMock.authStateReady.mockReset();
    authMock.currentUser = null;
  });

  it('usa o token da sessão que o SDK ainda estava restaurando', async () => {
    encenarRestauracao('token-restaurado');

    await expect(firebaseIdToken()).resolves.toBe('token-restaurado');
  });

  it('exige login novamente quando o estado inicial resolve sem sessão', async () => {
    encenarSemSessao();

    await expect(firebaseIdToken()).rejects.toThrow(/Entre novamente/);
  });
});

describe('authenticatedFetch', () => {
  beforeEach(() => {
    authMock.authStateReady.mockReset();
    authMock.currentUser = null;
  });

  it('assina a chamada do painel com a sessão restaurada', async () => {
    encenarRestauracao('token-restaurado');
    const fetchSpy = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const response = await authenticatedFetch('/api/admin-dashboard');

    expect(response.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [RequestInfo, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-restaurado');
  });

  it('não deixa a requisição sair sem token quando não há sessão', async () => {
    encenarSemSessao();
    const fetchSpy = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchSpy);

    await expect(authenticatedFetch('/api/admin-dashboard')).rejects.toThrow(/Entre novamente/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
