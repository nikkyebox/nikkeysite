// Cache do catálogo em IndexedDB.
//
// Por que não localStorage: o limite de ~5 MB é um precipício. Bastavam alguns
// produtos com imagem embutida para o catálogo não caber, o cache era
// descartado e TODA navegação relia os ~265 documentos do Firestore — foi o
// que esgotou a cota diária e derrubou a loja em 26/07/2026.
//
// Guarda o resultado bruto do Firestore (overrides + tombstones), não a lista
// já mesclada com os defaults: a mesclagem é barata e refazê-la a cada leitura
// mantém a sincronização incremental correta quando um único produto muda.
import type { Product } from '@/types';

const DB_NAME = 'jp_catalog';
const DB_VERSION = 1;
const STORE = 'snapshot';
const KEY = 'overrides';

export interface CatalogSnapshot {
  items: Product[];
  /** IDs com soft-delete (`__deleted`), preservados para não ressuscitarem. */
  deleted: string[];
  /** Maior `updatedAt` já visto, em ms. Relógio do SERVIDOR, nunca do cliente:
   *  usar `Date.now()` aqui perderia atualizações sempre que o relógio local
   *  estivesse adiantado. */
  syncedAtMs: number;
}

function abrir(): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(STORE)) {
      req.result.createObjectStore(STORE);
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
  return promise;
}

export async function lerCatalogo(): Promise<CatalogSnapshot | null> {
  try {
    const db = await abrir();
    const { promise, resolve, reject } = Promise.withResolvers<CatalogSnapshot | undefined>();
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as CatalogSnapshot | undefined);
    req.onerror = () => reject(req.error);
    const valor = await promise;
    db.close();
    if (!valor?.items?.length) return null;
    return valor;
  } catch {
    return null;
  }
}

export async function gravarCatalogo(snapshot: CatalogSnapshot): Promise<void> {
  try {
    const db = await abrir();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(snapshot, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    await promise;
    db.close();
  } catch {
    // Safari privado / cota do disco — segue sem cache, apenas mais lento.
  }
}

export async function limparCatalogo(): Promise<void> {
  try {
    const db = await abrir();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    await promise;
    db.close();
  } catch {
    // nada a fazer — o cache já está inacessível
  }
}
