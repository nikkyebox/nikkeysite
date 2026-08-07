import { firebaseConfig } from '@/config/firebase';
import { ADMIN_EMAIL } from '@/config/admin';
import { authenticatedFetch } from '@/services/authenticatedFetch';

const isDev = import.meta.env.DEV;
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};

export type AdminRole = 1 | 2 | 3;

export interface AdminEntry {
  username: string;
  name: string;
  role: AdminRole;
  addedAt?: string;
  addedBy?: string;
}

export interface AdminSession extends AdminEntry {
  // Presente apenas para sub-admins (login via API server-side com custom
  // token). Ausente para o super-admin: o client autentica direto no
  // Identity Toolkit e depois faz signInWithEmailAndPassword de verdade —
  // sem depender de nenhuma função serverless (funciona em `vite dev` puro).
  customToken?: string;
}

interface ErrorPayload {
  error?: string;
}

function adminEntry(value: unknown): AdminEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const role = Number(record.role);
  if (typeof record.username !== 'string' || typeof record.name !== 'string' || ![1, 2, 3].includes(role)) {
    return null;
  }
  return {
    username: record.username,
    name: record.name,
    role: role as AdminRole,
    addedAt: typeof record.addedAt === 'string' ? record.addedAt : undefined,
    addedBy: typeof record.addedBy === 'string' ? record.addedBy : undefined,
  };
}

async function errorCode(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({})) as ErrorPayload;
  return payload.error || 'request_failed';
}

export const adminService = {
  async authenticate(identifier: string, password: string): Promise<AdminSession | null> {
    // Super-admin: valida a senha direto no Identity Toolkit do Firebase (REST
    // pública, sem depender de nenhuma API serverless). Não dispara
    // onAuthStateChanged do SDK aqui — UserContext.login() faz o signIn de
    // verdade DEPOIS de salvar o estado local, evitando corrida.
    if (identifier.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      try {
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL, password, returnSecureToken: true }),
          },
        );
        if (!res.ok) return null;
        return { username: ADMIN_EMAIL, name: 'Administrador', role: 3 };
      } catch (error) {
        devWarn('[admin] authenticate (super-admin) falhou:', error);
        return null;
      }
    }

    // Sub-admins: nunca mais lê Firestore/senha no client — passa pela API
    // server-side (custom token via Admin SDK).
    try {
      const response = await fetch('/api/admin-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      if (!response.ok) return null;
      const payload = await response.json() as { customToken?: unknown; admin?: unknown };
      const entry = adminEntry(payload.admin);
      if (!entry || typeof payload.customToken !== 'string' || !payload.customToken) return null;
      return { ...entry, customToken: payload.customToken };
    } catch (error) {
      devWarn('[admin] authenticate falhou:', error);
      return null;
    }
  },

  async getAdmins(): Promise<AdminEntry[]> {
    const superAdmin: AdminEntry = {
      username: ADMIN_EMAIL,
      name: 'Administrador',
      role: 3,
      addedBy: 'sistema',
    };
    try {
      const response = await authenticatedFetch('/api/admin-users');
      if (!response.ok) throw new Error(await errorCode(response));
      const payload = await response.json() as { admins?: unknown };
      const remote = Array.isArray(payload.admins)
        ? payload.admins.map(adminEntry).filter((entry): entry is AdminEntry => entry !== null)
        : [];
      const withoutDuplicateSuper = remote.filter(
        (entry) => entry.username.toLowerCase() !== ADMIN_EMAIL.toLowerCase(),
      );
      return [superAdmin, ...withoutDuplicateSuper]
        .sort((left, right) => right.role - left.role || left.name.localeCompare(right.name));
    } catch (error) {
      devWarn('[admin] getAdmins falhou:', error);
      return [superAdmin];
    }
  },

  async addAdmin(
    name: string,
    password: string,
    role: AdminRole,
    addedBy?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await authenticatedFetch('/api/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password, role, addedBy: addedBy || '' }),
      });
      return response.ok ? { ok: true } : { ok: false, error: await errorCode(response) };
    } catch (error) {
      devError('[admin] addAdmin falhou:', error);
      return { ok: false, error: 'request_failed' };
    }
  },

  async removeAdmin(username: string): Promise<boolean> {
    try {
      const response = await authenticatedFetch('/api/admin-users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      return response.ok;
    } catch (error) {
      devError('[admin] removeAdmin falhou:', error);
      return false;
    }
  },

  isSuper: (username?: string): boolean =>
    !!username && username.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
};
