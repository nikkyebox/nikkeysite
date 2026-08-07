import { auth } from '@/config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ADMIN_EMAIL } from '@/config/admin';

// Exige a senha do admin antes de ações destrutivas (excluir pedido/cliente,
// resetar histórico). Verifica via Firebase Auth — sem senha no bundle.
export async function requireAdminPassword(action = 'esta ação'): Promise<boolean> {
  const input = window.prompt(`🔒 Digite a senha do admin para confirmar ${action}:`);
  if (input === null) return false;
  if (!auth) return false;
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, input);
    return true;
  } catch {
    window.alert('❌ Senha incorreta. Ação cancelada.');
    return false;
  }
}
