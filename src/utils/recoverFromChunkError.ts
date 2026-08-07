/**
 * Recuperação de "chunk error" pós-deploy do PWA.
 *
 * Quando um novo deploy troca os hashes dos chunks JS, o Service Worker antigo
 * ainda serve o HTML/assets em cache. Um window.location.reload() simples cai
 * no MESMO erro → loop infinito ("Esperando..." preso na tela).
 *
 * Esta função limpa os caches, desregistra o SW e recarrega de forma limpa,
 * com proteção contra loop via sessionStorage (no máx. 1 tentativa a cada 15s).
 */

const RELOAD_KEY = 'chunk_reload_at';
const RELOAD_COOLDOWN_MS = 15_000;

/** Detecta se um erro é de carregamento de chunk dinâmico (deploy novo). */
export const isChunkLoadError = (msg: string): boolean =>
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|dynamically imported module|ChunkLoadError/i.test(
    msg
  );

/**
 * Limpa caches + SW e recarrega. Retorna false se já recarregou há pouco
 * (evita loop infinito); nesse caso o chamador deve apenas mostrar a tela de erro.
 */
export const recoverFromChunkError = async (): Promise<boolean> => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
    if (Date.now() - last < RELOAD_COOLDOWN_MS) {
      // Já tentamos recarregar há pouco e ainda deu erro → não entra em loop.
      return false;
    }
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage indisponível (modo privado etc.) — segue mesmo assim.
  }

  // Limpa todos os Cache Storage (chunks antigos do Workbox).
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }

  // Desregistra o Service Worker do Workbox para o próximo load pegar o HTML novo.
  //
  // MENOS o registro em '/push/': a inscrição de Web Push pertence a ele, e
  // desregistrar destrói o PushSubscription do aparelho. O documento em
  // `push_subscriptions` continua no Firestore, o painel segue contando aquele
  // cliente como "vai receber push de verdade", o provedor aceita o envio — e
  // nada aparece na tela, sem erro em lugar nenhum. O problema de chunk é do SW
  // do Workbox, em '/', que é o único que precisa cair aqui.
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((r) => !new URL(r.scope).pathname.startsWith('/push/'))
          .map((r) => r.unregister())
      );
    }
  } catch {
    /* ignore */
  }

  // Reload limpo. O cache-bust por query evita HTML em cache do browser.
  const url = new URL(window.location.href);
  url.searchParams.set('_r', String(Date.now()));
  window.location.replace(url.toString());
  return true;
};
