import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
  ensureAdminAuth: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/adminAuth', () => ({ ensureAdminAuth: mocks.ensureAdminAuth }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ path: name }),
  doc: (_db: unknown, collectionName: string, id: string) => ({ path: `${collectionName}/${id}` }),
  getDoc: mocks.getDoc,
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: mocks.runTransaction,
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  setDoc: vi.fn(),
}));

import { raffleService } from './raffleService';

describe('sorteio', () => {
  beforeEach(() => {
    mocks.getDoc.mockReset();
    mocks.runTransaction.mockReset();
    mocks.ensureAdminAuth.mockReset().mockResolvedValue(undefined);
  });

  it('remove PII do documento entregue ao público', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        winners: [{
          rank: 1,
          userName: 'Ana',
          userId: 'uid-secreto',
          userEmail: 'ana@example.com',
          followsInstagram: false,
        }],
      }),
    });

    const raffle = await raffleService.getRaffle();
    expect(raffle.winners).toEqual([{ rank: 1, userName: 'Ana' }]);
    expect(raffle.winners[0]).not.toHaveProperty('userEmail');
    expect(raffle.winners[0]).not.toHaveProperty('userId');
  });

  it('recusa repetir uma rodada antes de creditar pontos novamente', async () => {
    const update = vi.fn();
    const set = vi.fn();
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback({
      get: async (ref: { path: string }) => ref.path === 'raffles/active'
        ? { exists: () => true, data: () => ({ winners: [{ rank: 1, userName: 'Anterior' }] }) }
        : { exists: () => true, data: () => ({ points: 100 }) },
      update,
      set,
    }));

    await expect(raffleService.draw(
      [{ rank: 1, type: 'points', points: 500 }],
      [{ id: 'u1', name: 'Ana', email: 'ana@example.com', followsInstagram: true, followsTiktok: true }],
    )).rejects.toThrow(/já foi realizado/i);
    expect(update).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('não concede nem publica prêmio para vencedor sem as duas redes sociais', async () => {
    const update = vi.fn();
    const set = vi.fn();
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback({
      get: async () => ({ exists: () => true, data: () => ({ winners: [], drawnAt: null }) }),
      update,
      set,
    }));

    const winners = await raffleService.draw(
      [{ rank: 1, type: 'points', points: 500 }],
      [{ id: 'u1', name: 'Ana', email: 'ana@example.com', followsInstagram: true, followsTiktok: false }],
    );

    expect(winners).toHaveLength(1);
    expect(update).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'raffles/active' }),
      expect.objectContaining({ winners: [] }),
      { merge: true },
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'raffle_admin/active' }),
      expect.objectContaining({
        winners: [expect.objectContaining({ userId: 'u1', followsTiktok: false })],
      }),
      { merge: true },
    );
  });
});
