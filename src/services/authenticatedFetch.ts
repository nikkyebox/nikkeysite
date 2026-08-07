import { auth } from '@/config/firebase';

export async function firebaseIdToken(): Promise<string> {
  if (!auth) throw new Error('Sessão Firebase necessária. Entre novamente.');
  // `auth.currentUser` é null enquanto o SDK restaura a sessão do IndexedDB, e
  // essa restauração é assíncrona: TODO primeiro carregamento depois de abrir o
  // navegador começa sem usuário, mesmo com sessão válida em disco. Sem esta
  // espera, as chamadas disparadas na montagem do painel (dashboard, relatório
  // de cupons, lista de admins) morriam aqui antes de sair, e o admin via
  // "sessão necessária" e dados zerados como se tivesse sido deslogado.
  // `authStateReady()` resolve quando o estado inicial fica conhecido — com a
  // sessão restaurada ou com a certeza de que não existe nenhuma.
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Sessão Firebase necessária. Entre novamente.');
  return user.getIdToken();
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await firebaseIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
