import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  startAfter: vi.fn((date: string, id: string) => ({ kind: 'startAfter', date, id })),
}));

vi.mock('@/config/firebase', () => ({
  auth: {},
  db: {},
  firebaseConfigReady: true,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ kind: 'collection' })),
  getDocs: firestoreMocks.getDocs,
  query: vi.fn((_collection, ...constraints) => ({ constraints })),
  where: vi.fn((field, operator, value) => ({ kind: 'where', field, operator, value })),
  orderBy: vi.fn((field, direction) => ({ kind: 'orderBy', field, direction })),
  limit: vi.fn((value) => ({ kind: 'limit', value })),
  startAfter: firestoreMocks.startAfter,
  documentId: vi.fn(() => '__name__'),
}));

import { firebaseSyncService } from '@/services/firebaseSyncService';

interface TestDocument {
  id: string;
  data: () => Record<string, unknown>;
}

function document(id: string, orderDate: string, extra: Record<string, unknown> = {}): TestDocument {
  return {
    id,
    data: () => ({ id, orderNumber: id, orderDate, ...extra }),
  };
}

function snapshot(docs: TestDocument[]) {
  return { docs };
}

describe('Firestore order pagination', () => {
  beforeEach(() => {
    firestoreMocks.getDocs.mockReset();
    firestoreMocks.startAfter.mockClear();
  });

  it('limits admin pages and resumes after the stable date/id cursor', async () => {
    firestoreMocks.getDocs
      .mockResolvedValueOnce(snapshot([
        document('order-3', '2026-07-03T00:00:00.000Z'),
        document('order-2', '2026-07-02T00:00:00.000Z'),
        document('order-1', '2026-07-01T00:00:00.000Z'),
      ]))
      .mockResolvedValueOnce(snapshot([
        document('order-1', '2026-07-01T00:00:00.000Z'),
      ]));

    const first = await firebaseSyncService.getOrdersPageFromFirestore(2);
    expect(first.items.map((order) => order.id)).toEqual(['order-3', 'order-2']);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await firebaseSyncService.getOrdersPageFromFirestore(2, first.nextCursor);
    expect(firestoreMocks.startAfter).toHaveBeenCalledWith('2026-07-02T00:00:00.000Z', 'order-2');
    expect(second.items.map((order) => order.id)).toEqual(['order-1']);
    expect(second.hasMore).toBe(false);
  });

  it('deduplicates user/email query results without skipping the next page', async () => {
    const shared = document('shared', '2026-07-04T00:00:00.000Z');
    firestoreMocks.getDocs
      .mockResolvedValueOnce(snapshot([
        shared,
        document('user-only', '2026-07-03T00:00:00.000Z'),
        document('older-user', '2026-07-01T00:00:00.000Z'),
      ]))
      .mockResolvedValueOnce(snapshot([
        shared,
        document('email-only', '2026-07-02T00:00:00.000Z'),
        document('older-email', '2026-06-30T00:00:00.000Z'),
      ]))
      .mockResolvedValueOnce(snapshot([]))
      .mockResolvedValueOnce(snapshot([
        document('email-only', '2026-07-02T00:00:00.000Z'),
      ]));

    const first = await firebaseSyncService.getOrdersFromFirestore('uid-1', 'buyer@example.com', 2);
    expect(first.items.map((order) => order.id)).toEqual(['shared', 'user-only']);
    expect(new Set(first.items.map((order) => order.id)).size).toBe(first.items.length);
    expect(first.hasMore).toBe(true);

    const second = await firebaseSyncService.getOrdersFromFirestore(
      'uid-1',
      'buyer@example.com',
      2,
      first.nextCursor,
    );
    expect(second.items.map((order) => order.id)).toEqual(['email-only']);
  });

  it('propagates Firestore query failures instead of presenting a false empty history', async () => {
    firestoreMocks.getDocs.mockRejectedValueOnce(new Error('missing-index'));
    await expect(firebaseSyncService.getOrdersPageFromFirestore(20)).rejects.toThrow('missing-index');
  });
});
