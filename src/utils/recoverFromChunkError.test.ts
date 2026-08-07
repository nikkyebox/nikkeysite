// A recuperação de chunk error desregistrava TODOS os service workers.
//
// Um deles é o de Web Push, registrado em escopo próprio '/push/'. A inscrição
// do aparelho pertence a esse registro: desregistrar destrói o PushSubscription
// do navegador. O documento em `push_subscriptions` fica no Firestore, o painel
// segue dizendo "vai receber push de verdade", o provedor aceita o envio com
// HTTP 201 — e nada aparece na tela do cliente. Nenhum erro em lugar nenhum.
//
// E isso disparava justamente depois de um deploy novo, que é quando o chunk
// error acontece: publicar a loja desligava o push de quem estava com a aba
// aberta.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, recoverFromChunkError } from '@/utils/recoverFromChunkError';

interface RegistroFalso {
  scope: string;
  unregister: () => Promise<boolean>;
}

function registro(scope: string): RegistroFalso {
  return { scope, unregister: vi.fn(async () => true) };
}

function encenar(registros: RegistroFalso[]) {
  const replace = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: 'https://www.nikkeybox-store.com/carrinho', replace },
  });
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations: vi.fn(async () => registros) },
  });
  vi.stubGlobal('caches', { keys: vi.fn(async () => ['workbox-precache']), delete: vi.fn(async () => true) });
  return { replace };
}

describe('recoverFromChunkError', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('derruba o SW do Workbox e PRESERVA o de push', async () => {
    const workbox = registro('https://www.nikkeybox-store.com/');
    const push = registro('https://www.nikkeybox-store.com/push/');
    const { replace } = encenar([workbox, push]);

    const recuperou = await recoverFromChunkError();

    expect(recuperou).toBe(true);
    expect(workbox.unregister).toHaveBeenCalledTimes(1);
    expect(push.unregister).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('limpa o Cache Storage, que é onde mora o chunk velho', async () => {
    encenar([registro('https://www.nikkeybox-store.com/')]);

    await recoverFromChunkError();

    expect(caches.delete).toHaveBeenCalledWith('workbox-precache');
  });

  it('não recarrega duas vezes seguidas — a trava contra loop continua', async () => {
    const { replace } = encenar([registro('https://www.nikkeybox-store.com/')]);

    await recoverFromChunkError();
    const segunda = await recoverFromChunkError();

    expect(segunda).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
  });
});

describe('isChunkLoadError', () => {
  it('reconhece as mensagens que os navegadores usam', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: /assets/x.js')).toBe(true);
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true);
    expect(isChunkLoadError('ChunkLoadError: Loading chunk 42 failed')).toBe(true);
  });

  it('não confunde erro comum com chunk error', () => {
    expect(isChunkLoadError('TypeError: x is not a function')).toBe(false);
    expect(isChunkLoadError('Missing or insufficient permissions.')).toBe(false);
  });
});
