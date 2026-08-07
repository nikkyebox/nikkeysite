import { auth } from '@/config/firebase';
import { ADMIN_EMAIL } from '@/config/admin';

const isDev = import.meta.env.DEV;
const devWarn = isDev ? console.warn.bind(console) : () => {};

// Verifica se o admin ainda está autenticado no Firebase antes de escritas.
// Após a migração para Firebase Auth puro, não há mais senha armazenada no bundle —
// se a sessão expirou, o admin precisa fazer login novamente.
export async function ensureAdminAuth(): Promise<void> {
  if (!auth) return;
  if (auth.currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return;
  devWarn('⚠️ ensureAdminAuth: sessão Firebase expirada — faça login novamente.');
}
