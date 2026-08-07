// Até 28/07/2026 o primeiro login por Google não criava cliente nenhum.
// `loginWithProvider` gravava `tempSocialSignUp` no localStorage e devolvia o
// sinal 'new-user' — mas NADA no app lia essa chave. Resultado: conta viva no
// Firebase Auth e nenhum documento em `users`. O cliente ficava invisível na
// lista do painel (25 contas no Auth contra 23 clientes listados), sem cupom de
// boas-vindas, e sem conseguir se cadastrar depois: o e-mail já estava em uso no
// Auth e senha nova não abre conta que é do provedor.
//
// O login por TELEFONE sempre fez certo — chama `hydrateSessionFromFirebaseUser`
// direto. Estes testes travam a simetria entre os dois caminhos.
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loginWithProvider: vi.fn(),
  getUserFromFirestore: vi.fn(),
  syncUserToFirestore: vi.fn(),
  onAuthChange: vi.fn((callback: (user: unknown) => void) => { callback(null); return () => undefined; }),
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
vi.mock('firebase/auth', () => ({ signInWithCustomToken: vi.fn(), signInWithEmailAndPassword: vi.fn() }));
vi.mock('@/services/adminService', () => ({
  adminService: { authenticate: vi.fn().mockResolvedValue(null), getAdmins: vi.fn(), isSuper: () => false },
}));
vi.mock('@/services/firebaseSyncService', () => ({
  firebaseSyncService: {
    onAuthChange: mocks.onAuthChange,
    loginWithProvider: mocks.loginWithProvider,
    getUserFromFirestore: mocks.getUserFromFirestore,
    syncUserToFirestore: mocks.syncUserToFirestore,
    logoutUser: vi.fn(),
    loginUser: vi.fn(),
    getOrdersPageFromFirestore: vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
    resendVerificationEmail: vi.fn(),
  },
}));
vi.mock('@/services/referralService', () => ({
  referralService: { captureReferral: vi.fn(), getPendingReferral: vi.fn(() => null), clearPendingReferral: vi.fn(), linkReferral: vi.fn() },
}));
vi.mock('@/lib/analytics', () => ({ trackLogin: vi.fn(), trackSignUp: vi.fn() }));
vi.mock('@/services/mailService', () => ({ sendVerificationEmail: vi.fn() }));

import { UserProvider, useUser } from './UserContext';

interface ResultadoLogin { success: boolean; error?: string }

let loginWithProvider: (provedor: 'google') => Promise<ResultadoLogin>;

function Probe() {
  const contexto = useUser();
  loginWithProvider = contexto.loginWithProvider;
  return (
    <div>
      <span data-testid="autenticado">{contexto.isAuthenticated ? 'sim' : 'nao'}</span>
      <span data-testid="email">{contexto.user?.email || '-'}</span>
      <span data-testid="cupons">{contexto.coupons.map((c) => c.code).join(',') || '-'}</span>
    </div>
  );
}

const CONTA_GOOGLE = { uid: 'uid-google-1', email: 'Cliente.Novo@Gmail.com', displayName: 'Cliente Novo', photoURL: null };

describe('primeiro login social', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.loginWithProvider.mockReset().mockResolvedValue(CONTA_GOOGLE);
    mocks.getUserFromFirestore.mockReset().mockResolvedValue(null);
    mocks.syncUserToFirestore.mockReset().mockResolvedValue(true);
  });

  it('cria o cliente no Firestore, com o cupom de boas-vindas', async () => {
    render(<UserProvider><Probe /></UserProvider>);

    let resultado: ResultadoLogin | undefined;
    await act(async () => { resultado = await loginWithProvider('google'); });

    await waitFor(() => expect(mocks.syncUserToFirestore).toHaveBeenCalledTimes(1));
    const [uid, perfil] = mocks.syncUserToFirestore.mock.calls[0] as [string, Record<string, unknown>];
    expect(uid).toBe('uid-google-1');
    expect(perfil.id).toBe('uid-google-1');
    expect(perfil.email).toBe('cliente.novo@gmail.com'); // normalizado
    expect(perfil.name).toBe('Cliente Novo');
    expect(perfil.createdAt).toEqual(expect.any(String));
    expect(perfil.address).toEqual({ postalCode: '', prefecture: '', city: '', address: '' });
    const cupons = perfil.coupons as { code: string; isUsed: boolean }[];
    expect(cupons.map((c) => c.code)).toEqual(['BEMVINDO10']);
    expect(cupons[0].isUsed).toBe(false);
    // Sinal para a UI pedir endereço/telefone — mas o cliente já existe.
    expect(resultado).toEqual({ success: true, error: 'new-user' });
  });

  it('abre a sessão em vez de deixar o cliente autenticado no vazio', async () => {
    render(<UserProvider><Probe /></UserProvider>);

    await act(async () => { await loginWithProvider('google'); });

    expect(screen.getByTestId('autenticado').textContent).toBe('sim');
    expect(screen.getByTestId('email').textContent).toBe('cliente.novo@gmail.com');
    expect(screen.getByTestId('cupons').textContent).toBe('BEMVINDO10');
    expect(JSON.parse(localStorage.getItem('user') || '{}').id).toBe('uid-google-1');
  });

  it('não grava mais a chave morta tempSocialSignUp', async () => {
    render(<UserProvider><Probe /></UserProvider>);

    await act(async () => { await loginWithProvider('google'); });

    expect(localStorage.getItem('tempSocialSignUp')).toBeNull();
  });

  it('cliente que já tem perfil entra sem recriar o documento', async () => {
    // Com o cupom de boas-vindas já no perfil: sem ele, o app concede um na
    // hora (comportamento próprio de `resolveUserCoupons`) e a gravação que
    // este teste vigia deixaria de significar "recriou o cliente".
    mocks.getUserFromFirestore.mockResolvedValue({
      id: 'uid-google-1', name: 'Cliente Antigo', email: 'cliente.novo@gmail.com',
      phone: '090', address: { postalCode: '', prefecture: '', city: '', address: '' },
      createdAt: '2026-01-01T00:00:00.000Z',
      coupons: [{ id: 'w1', code: 'BEMVINDO10', description: '10%', discount: 10, discountType: 'percentage', expiresAt: '2030-01-01T00:00:00.000Z', isUsed: false }],
    });
    render(<UserProvider><Probe /></UserProvider>);

    let resultado: ResultadoLogin | undefined;
    await act(async () => { resultado = await loginWithProvider('google'); });

    expect(resultado).toEqual({ success: true });
    expect(mocks.syncUserToFirestore).not.toHaveBeenCalled();
    expect(screen.getByTestId('email').textContent).toBe('cliente.novo@gmail.com');
    expect(screen.getByTestId('autenticado').textContent).toBe('sim');
  });
});
