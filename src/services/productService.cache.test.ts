// A loja caiu inteira em 26/07/2026 porque cada navegação relia os ~265
// documentos do catálogo: a cota diária do Firestore acabava e TODO endpoint
// que toca o banco passava a responder 503 — inclusive o envio de e-mails.
//
// Estes testes defendem o contrato que impede a repetição: depois da primeira
// visita, só o que mudou é lido.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  query: vi.fn((_alvo: unknown, ...restricoes: unknown[]) => ({ restricoes })),
  where: vi.fn((campo: string, op: string, valor: unknown) => ({ campo, op, valor })),
}));

const cacheMocks = vi.hoisted(() => ({ snapshot: null as unknown }));

vi.mock('@/config/firebase', () => ({ auth: {}, db: {}, firebaseConfigReady: true }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ kind: 'collection' })),
  getDocs: firestoreMocks.getDocs,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
  Timestamp: { fromMillis: (ms: number) => ({ ms }) },
  doc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  increment: vi.fn(),
  serverTimestamp: vi.fn(),
  deleteField: vi.fn(),
}));

vi.mock('@/services/catalogCache', () => ({
  lerCatalogo: async () => cacheMocks.snapshot,
  gravarCatalogo: async (s: unknown) => { cacheMocks.snapshot = s; },
  limparCatalogo: async () => { cacheMocks.snapshot = null; },
}));

vi.mock('@/data/products', () => ({ products: [] }));
vi.mock('@/utils/adminAuth', () => ({ ensureAdminAuth: vi.fn() }));
vi.mock('@/services/cloudinaryService', () => ({ cdnImage: (url: string) => url }));

import { invalidateProductCache, productService, resetProductCache } from '@/services/productService';

interface FakeDoc {
  id: string;
  data: () => Record<string, unknown>;
}

function produto(id: string, updatedAtMs: number, extra: Record<string, unknown> = {}): FakeDoc {
  return {
    id,
    data: () => ({
      name: id,
      image: `https://cdn/${id}.webp`,
      updatedAt: { toMillis: () => updatedAtMs },
      ...extra,
    }),
  };
}

function responder(docs: FakeDoc[]): void {
  firestoreMocks.getDocs.mockResolvedValueOnce({
    forEach: (fn: (d: FakeDoc) => void) => docs.forEach(fn),
  });
}

describe('sincronização do catálogo', () => {
  beforeEach(async () => {
    cacheMocks.snapshot = null;
    firestoreMocks.getDocs.mockReset();
    firestoreMocks.where.mockClear();
    await resetProductCache();
  });

  it('faz leitura completa na primeira visita e nenhuma na navegação seguinte', async () => {
    responder([produto('a', 1000), produto('b', 2000)]);

    const primeira = await productService.getMerged();
    expect(primeira).toHaveLength(2);
    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(1);
    // Sem filtro: primeira visita precisa do catálogo inteiro.
    expect(firestoreMocks.where).not.toHaveBeenCalled();

    const segunda = await productService.getMerged();

    expect(segunda).toHaveLength(2);
    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(1); // zero leituras novas
  });

  it('pergunta só o que mudou depois do maior updatedAt visto', async () => {
    responder([produto('a', 1000), produto('b', 5000)]);
    await productService.getMerged();

    invalidateProductCache();
    responder([]);
    await productService.getMerged();

    // Parte do maior updatedAt (5000), não do relógio do cliente.
    expect(firestoreMocks.where).toHaveBeenCalledWith('updatedAt', '>=', { ms: 5000 });
  });

  it('aplica o delta sobre o cache sem reler o catálogo inteiro', async () => {
    responder([produto('a', 1000), produto('b', 2000)]);
    await productService.getMerged();

    invalidateProductCache();
    responder([produto('b', 9000, { name: 'b-editado' })]);
    const depois = await productService.getMerged();

    expect(depois).toHaveLength(2); // 'a' sobreviveu, veio do cache
    expect(depois.find((p) => p.id === 'b')?.name).toBe('b-editado');
    expect(depois.find((p) => p.id === 'a')?.name).toBe('a');
  });

  it('propaga exclusão que chega pelo delta', async () => {
    responder([produto('a', 1000), produto('b', 2000)]);
    await productService.getMerged();

    invalidateProductCache();
    responder([produto('b', 9000, { __deleted: true })]);
    const depois = await productService.getMerged();

    expect(depois.map((p) => p.id)).toEqual(['a']);
  });

  it('serve o cache quando o Firestore recusa, em vez de esvaziar a vitrine', async () => {
    responder([produto('a', 1000)]);
    await productService.getMerged();

    invalidateProductCache();
    firestoreMocks.getDocs.mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED'));
    const durantePane = await productService.getMerged();

    expect(durantePane.map((p) => p.id)).toEqual(['a']);
  });
});
