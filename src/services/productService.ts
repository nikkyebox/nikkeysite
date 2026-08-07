// Serviço de produtos com persistência no Firestore + Firebase Storage para imagens.
// Os produtos de `data/products.ts` são a base (defaults).
// O admin pode criar/editar/remover; as mudanças ficam no Firestore (collection "products").
// Imagens ficam no Cloudinary (CDN) — Firestore guarda só as URLs.
// O catálogo é cacheado em IndexedDB e sincronizado por delta: depois da
// primeira visita, só o que mudou é lido do Firestore.

import { db } from '@/config/firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  deleteField,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import type { CatalogSnapshot } from '@/services/catalogCache';
import { gravarCatalogo, lerCatalogo, limparCatalogo } from '@/services/catalogCache';
import { Product } from '@/types';
import { cdnImage } from '@/services/cloudinaryService';
import { products as defaultProducts } from '@/data/products';
import { ensureAdminAuth } from '@/utils/adminAuth';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


const COL = 'products';

// ─── Cache do catálogo (IndexedDB + sincronização por delta) ───────────────
//
// Antes: localStorage com teto de ~5 MB. Alguns produtos com imagem em base64
// estouravam o teto, o cache era descartado em silêncio e TODA navegação
// relia os ~265 documentos. A cota diária do Firestore acabava com ~37
// visitantes e a loja inteira caía — foi o que aconteceu em 26/07/2026.
//
// Agora: IndexedDB (sem teto prático) + delta. Dentro da janela abaixo nem
// consultamos o Firestore (0 leituras). Passada a janela, perguntamos apenas
// "o que mudou desde X?", o que custa ~1 leitura quando nada mudou — contra
// as ~265 de reler o catálogo.
const JANELA_VERIFICACAO = 60 * 60 * 1000; // 60 minutos

let memoria: CatalogSnapshot | null = null;
let verificadoEm = 0;
let precisaVerificar = true;

/** Marca que a próxima leitura deve perguntar ao Firestore o que mudou.
 *  NÃO descarta o cache: o delta parte do que já existe, então uma edição do
 *  admin custa a leitura do documento editado, não a do catálogo inteiro. */
export function invalidateProductCache(): void {
  precisaVerificar = true;
}

/** Descarta o cache e força recarga completa. Só para recuperação — custa uma
 *  leitura por documento do catálogo. */
export async function resetProductCache(): Promise<void> {
  memoria = null;
  precisaVerificar = true;
  verificadoEm = 0;
  await limparCatalogo();
}

/** Converte um Timestamp do Firestore em ms. Escritas ainda pendentes chegam
 *  como `null` (o `serverTimestamp()` só resolve no servidor) — nesse caso
 *  devolve 0 para não avançar o marcador de sincronismo indevidamente. */
function instanteMs(valor: unknown): number {
  const ts = valor as { toMillis?: () => number } | null | undefined;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  return 0;
}
// ──────────────────────────────────────────────────────────────────────────

const stripUndefined = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefined(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      const cleanItem = stripUndefined(item);
      if (cleanItem !== undefined) acc[key] = cleanItem;
      return acc;
    }, {});
  }
  return value;
};

interface Overrides {
  items: Product[];
  deleted: string[];
}

/** Aplica o perfil de entrega de alta qualidade nas URLs de imagem.
 *  Roda no ingresso do Firestore para que todos os pontos de render recebam a
 *  URL certa sem repetir a transformação — inclusive os produtos legados, cuja
 *  URL gravada ainda carrega o `f_webp,q_auto` (≈75%) do pipeline antigo. */
const withCdnImages = (p: Product): Product => ({
  ...p,
  image: cdnImage(p.image),
  ...(p.thumbnail ? { thumbnail: cdnImage(p.thumbnail) } : {}),
  ...(p.gallery ? { gallery: p.gallery.map((g) => cdnImage(g)) } : {}),
});

export const productService = {
  /** Lê os documentos do Firestore. Com `desdeMs`, traz só o que mudou depois
   *  daquele instante — é a diferença entre ~265 leituras e ~1 por visita.
   *
   *  Usa `>=` e não `>` de propósito: dois documentos podem compartilhar o
   *  mesmo milissegundo, e `>` perderia o segundo para sempre. O custo é
   *  reler 1 documento por sincronização; perder uma atualização custaria
   *  estoque errado na vitrine. */
  async getOverrides(desdeMs: number | null = null): Promise<Overrides & { maxMs: number }> {
    if (!db) throw new Error('Firebase indisponível');
    try {
      const alvo = collection(db, COL);
      const snap = await getDocs(
        desdeMs === null ? alvo : query(alvo, where('updatedAt', '>=', Timestamp.fromMillis(desdeMs))),
      );
      const items: Product[] = [];
      const deleted: string[] = [];
      let maxMs = desdeMs ?? 0;
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        maxMs = Math.max(maxMs, instanteMs(data.updatedAt));
        if (data.__deleted) {
          deleted.push(d.id);
          return;
        }
        items.push(withCdnImages({ id: d.id, ...(data as object) } as Product));
      });
      return { items, deleted, maxMs };
    } catch (e) {
      devWarn('productService.getOverrides falhou:', e);
      throw e;
    }
  },

  /** Sincroniza o cache local com o Firestore e devolve o retrato atual.
   *  Primeira visita: leitura completa. Depois: só o delta. */
  async sync(): Promise<CatalogSnapshot | null> {
    if (!memoria) memoria = await lerCatalogo();

    const base = memoria;
    const { items, deleted, maxMs } = await this.getOverrides(base ? base.syncedAtMs : null);

    if (!base) {
      if (!items.length && !deleted.length) return null;
      memoria = { items, deleted, syncedAtMs: maxMs };
    } else {
      // Delta: o que voltou sobrepõe o que havia; o resto permanece intacto.
      const porId = new Map(base.items.map((p) => [p.id, p]));
      const removidos = new Set(base.deleted);
      for (const p of items) {
        porId.set(p.id, p);
        removidos.delete(p.id); // produto restaurado deixa de ser tombstone
      }
      for (const id of deleted) {
        porId.delete(id);
        removidos.add(id);
      }
      memoria = {
        items: Array.from(porId.values()),
        deleted: Array.from(removidos),
        syncedAtMs: Math.max(base.syncedAtMs, maxMs),
      };
    }

    verificadoEm = Date.now();
    precisaVerificar = false;
    await gravarCatalogo(memoria);
    return memoria;
  },

  /** Lista final: Firestore é fonte de verdade. defaultProducts entram só para
   *  IDs que o Firestore não tem (evita tela vazia em erros parciais).
   *
   *  Dentro da janela de verificação não há NENHUMA leitura do Firestore. */
  async getMerged(forceRefresh = false): Promise<Product[]> {
    if (!memoria) memoria = await lerCatalogo();

    const dentroDaJanela = Date.now() - verificadoEm < JANELA_VERIFICACAO;
    const podeServirDoCache = memoria && !forceRefresh && !precisaVerificar && dentroDaJanela;

    if (!podeServirDoCache) {
      try {
        await this.sync();
      } catch {
        // Firestore inacessível (offline, cota esgotada, auth não pronta).
        // Servir o cache é melhor que uma vitrine vazia.
        if (!memoria) return defaultProducts;
      }
    }

    if (!memoria) return defaultProducts;

    const map = new Map<string, Product>();
    // Defaults entram sem imagem própria — só como esqueleto de fallback.
    for (const p of defaultProducts) {
      map.set(p.id, { ...p, image: '', gallery: [], thumbnail: undefined });
    }
    for (const p of memoria.items) map.set(p.id, p);
    for (const id of memoria.deleted) map.delete(id);
    return Array.from(map.values()).filter((p) => p.image);
  },

  /** Cria ou atualiza um produto. Invalida o cache local automaticamente. */
  async save(product: Product): Promise<void> {
    if (!db) throw new Error('Firebase indisponível');
    await ensureAdminAuth();
    const { id, ...rest } = product;
    const cleanRest = stripUndefined(rest) as Record<string, unknown>;
    Object.entries(rest).forEach(([key, value]) => {
      if (value === undefined) cleanRest[key] = deleteField();
    });
    await setDoc(
      doc(db, COL, id),
      { ...cleanRest, __deleted: false, updatedAt: serverTimestamp() },
      { merge: true }
    );
    invalidateProductCache();
  },

  /** Decrementa o estoque ao confirmar uma venda. No-op se produto não existe
   *  ou é ilimitado.
   *
   *  `updatedAt` é obrigatório aqui: a sincronização por delta pergunta ao
   *  Firestore "o que mudou desde X?". Uma venda que não carimbasse a data
   *  ficaria invisível para todos os clientes com cache, que continuariam
   *  vendo o estoque antigo — e a loja venderia o que não tem. */
  async decrementStock(productId: string, qty: number): Promise<void> {
    if (!db || qty <= 0) return;
    try {
      await updateDoc(doc(db, COL, productId), {
        'stock.quantity': increment(-qty),
        updatedAt: serverTimestamp(),
      });
      invalidateProductCache();
    } catch {
      // Produto pode não existir no Firestore (default); ignora silenciosamente
    }
  },

  /** Esconde um produto (soft-delete) — funciona inclusive para os defaults. */
  async remove(id: string): Promise<void> {
    if (!db) throw new Error('Firebase indisponível');
    await ensureAdminAuth();
    await setDoc(
      doc(db, COL, id),
      { __deleted: true, updatedAt: serverTimestamp() },
      { merge: true }
    );
    invalidateProductCache();
  },
};
