// O sino de negociações do painel usava `listenAll`: abrir /admin baixava a
// coleção `negotiations` INTEIRA só para contar as pendentes, e cada documento
// carrega `cartItems` + `checkoutForm` completos. Custo por abertura que cresce
// para sempre — na mesma família do que esgotou a cota do Firestore em
// 26/07/2026.
//
// Este teste trava o filtro no servidor: se alguém trocar de volta para a
// coleção inteira, ou tirar o `where`, ele falha.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  where: vi.fn((field: string, operator: string, value: unknown) => ({ kind: 'where', field, operator, value })),
  orderBy: vi.fn((field: string, direction?: string) => ({ kind: 'orderBy', field, direction })),
}));

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, firebaseConfigReady: true }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ kind: 'collection', name })),
  query: vi.fn((collectionRef: unknown, ...constraints: unknown[]) => ({ collectionRef, constraints })),
  where: firestoreMocks.where,
  orderBy: firestoreMocks.orderBy,
  onSnapshot: firestoreMocks.onSnapshot,
  doc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
}));

import { negotiationService } from '@/services/negotiationService';

interface QueryCapturada {
  collectionRef: { name: string };
  constraints: { kind: string; field?: string; operator?: string; value?: unknown }[];
}

/** Devolve a query que o listener registrou no Firestore. */
function queryRegistrada(): QueryCapturada {
  const [consulta] = firestoreMocks.onSnapshot.mock.calls[0] as [QueryCapturada];
  return consulta;
}

describe('negotiationService.listenPending', () => {
  beforeEach(() => {
    firestoreMocks.onSnapshot.mockReset();
    firestoreMocks.onSnapshot.mockReturnValue(() => undefined);
    firestoreMocks.where.mockClear();
    firestoreMocks.orderBy.mockClear();
  });

  it('filtra status=pending no servidor, sem baixar a coleção inteira', () => {
    negotiationService.listenPending(() => {});

    const consulta = queryRegistrada();
    expect(consulta.collectionRef.name).toBe('negotiations');
    expect(consulta.constraints).toEqual([
      { kind: 'where', field: 'status', operator: '==', value: 'pending' },
    ]);
  });

  it('não usa orderBy — evitaria índice composto sem necessidade', () => {
    negotiationService.listenPending(() => {});

    expect(firestoreMocks.orderBy).not.toHaveBeenCalled();
  });

  it('entrega as pendentes recebidas para quem escuta', () => {
    let recebidas: { id: string }[] = [];
    negotiationService.listenPending((pendentes) => { recebidas = pendentes; });

    const [, aoReceber] = firestoreMocks.onSnapshot.mock.calls[0] as [unknown, (snap: unknown) => void];
    aoReceber({ docs: [{ data: () => ({ id: 'n1', status: 'pending' }) }, { data: () => ({ id: 'n2', status: 'pending' }) }] });

    expect(recebidas.map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  it('a lista completa do gerenciador continua ordenada por data', () => {
    negotiationService.listenAll(() => {});

    const consulta = queryRegistrada();
    expect(consulta.constraints).toEqual([
      { kind: 'orderBy', field: 'createdAt', direction: 'desc' },
    ]);
  });
});
