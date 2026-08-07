// Em 28/07/2026 o painel mostrava, no mesmo segundo do "Login realizado!":
// 403 permission-denied na contagem de `users`, "Missing or insufficient
// permissions" no listener de negociações e "Não foi possível atualizar os dados
// consolidados". A senha estava certa e a sessão do Firebase nascia poucos
// milissegundos depois — o problema era a ORDEM.
//
// `login()` marcava `isAuthenticated` ANTES de esperar o signIn do SDK. A tela
// de login navegava para /admin no mesmo instante, o painel montava e disparava
// as leituras protegidas sem token nenhum. Regra do Firestore exige admin, então
// tudo voltava negado — e nenhuma dessas consultas é refeita sozinha depois.
//
// Estes testes travam as duas metades do contrato: nada de sessão de painel
// antes do Firebase aceitar, e nada de "login OK" quando ele recusa.
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_EMAIL } from '@/config/admin';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithCustomToken: vi.fn(),
  onAuthChange: vi.fn((callback: (user: unknown) => void) => {
    callback(null); // boot real: o SDK resolve "sem sessão" antes de qualquer login
    return () => undefined;
  }),
}));

vi.mock('@/config/firebase', () => ({
  app: null,
  auth: { currentUser: null },
  db: null,
  storage: null,
  firebaseConfigReady: true,
  allowLocalOnly: false,
  firebaseDisabled: false,
}));
vi.mock('firebase/auth', () => ({
  signInWithCustomToken: mocks.signInWithCustomToken,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
}));
vi.mock('@/services/adminService', () => ({
  adminService: { authenticate: mocks.authenticate, getAdmins: vi.fn(), isSuper: () => true },
}));
vi.mock('@/services/firebaseSyncService', () => ({
  firebaseSyncService: {
    onAuthChange: mocks.onAuthChange,
    getUserFromFirestore: vi.fn(),
    logoutUser: vi.fn(),
    loginUser: vi.fn(),
    getOrdersPageFromFirestore: vi.fn(),
    resendVerificationEmail: vi.fn(),
  },
}));
vi.mock('@/services/referralService', () => ({
  referralService: {
    captureReferral: vi.fn(),
    getPendingReferral: vi.fn(() => null),
    clearPendingReferral: vi.fn(),
  },
}));
vi.mock('@/lib/analytics', () => ({ trackLogin: vi.fn(), trackSignUp: vi.fn() }));
vi.mock('@/services/mailService', () => ({ sendVerificationEmail: vi.fn() }));

import { UserProvider, useUser } from './UserContext';

type Login = (email: string, password: string) => Promise<{ success: boolean; error?: string }>;

let login: Login;

function Probe() {
  const contexto = useUser();
  login = contexto.login;
  return <span data-testid="autenticado">{contexto.isAuthenticated ? 'sim' : 'nao'}</span>;
}

function montar() {
  render(
    <UserProvider>
      <Probe />
    </UserProvider>,
  );
}

describe('login de admin', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.authenticate.mockReset();
    mocks.signInWithEmailAndPassword.mockReset();
    mocks.signInWithCustomToken.mockReset();
    mocks.authenticate.mockResolvedValue({ username: ADMIN_EMAIL, name: 'Administrador', role: 3 });
  });

  it('só abre a sessão do painel depois do Firebase aceitar', async () => {
    const signIn = Promise.withResolvers<unknown>();
    mocks.signInWithEmailAndPassword.mockReturnValue(signIn.promise);
    montar();

    let resultado: { success: boolean } | undefined;
    const chamada = login(ADMIN_EMAIL, 'senha-correta').then((r) => { resultado = r; });

    // signIn em voo: o painel NÃO pode estar montado ainda, senão as leituras
    // protegidas saem sem token — foi exatamente o 403 do relato.
    await waitFor(() => expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('autenticado').textContent).toBe('nao');
    // O admin já está no localStorage: é o que impede o listener de auth de
    // sobrescrever a sessão com perfil de cliente quando o signIn responder.
    expect(JSON.parse(localStorage.getItem('user') || '{}').id).toBe('admin-001');

    await act(async () => {
      signIn.resolve({ user: { uid: 'admin-uid' } });
      await chamada;
    });

    expect(resultado).toEqual({ success: true });
    expect(screen.getByTestId('autenticado').textContent).toBe('sim');
  });

  it('recusa o login quando o Firebase não abre a sessão', async () => {
    mocks.signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/network-request-failed' });
    montar();

    let resultado: { success: boolean; error?: string } | undefined;
    await act(async () => {
      resultado = await login(ADMIN_EMAIL, 'senha-correta');
    });

    expect(resultado?.success).toBe(false);
    expect(resultado?.error).toMatch(/sessão do painel/i);
    expect(screen.getByTestId('autenticado').textContent).toBe('nao');
    // Sem sessão fantasma: nada de painel restaurado do localStorage no F5.
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('sub-admin entra pelo custom token, com a mesma ordem', async () => {
    mocks.authenticate.mockResolvedValue({
      username: 'paula', name: 'Paula', role: 2, customToken: 'token-do-servidor',
    });
    const signIn = Promise.withResolvers<unknown>();
    mocks.signInWithCustomToken.mockReturnValue(signIn.promise);
    montar();

    const chamada = login('paula', 'senha-correta');

    await waitFor(() => expect(mocks.signInWithCustomToken).toHaveBeenCalledWith(
      expect.anything(), 'token-do-servidor',
    ));
    expect(screen.getByTestId('autenticado').textContent).toBe('nao');
    expect(mocks.signInWithEmailAndPassword).not.toHaveBeenCalled();

    await act(async () => {
      signIn.resolve({ user: { uid: 'sub-admin-uid' } });
      await chamada;
    });

    expect(screen.getByTestId('autenticado').textContent).toBe('sim');
  });
});
