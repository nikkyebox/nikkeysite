// Catálogo público servido pelo CDN da Vercel (/api/public-catalog).
//
// A vitrine inteira (produtos sem campos sensíveis, categorias e conteúdo da
// home) vem num único JSON cacheado na borda. O cliente não lê o Firestore
// para nada público; o Firebase fica para login, pedidos, perfil e o Admin.
import type { Product } from '@/types';

export interface PublicCatalog {
  generatedAt: number;
  products: { items: Product[]; deleted: string[]; maxMs: number };
  categories: unknown[];
  content: Record<'settings' | 'home' | 'vlog' | 'homePromotion', Record<string, unknown> | null>;
}

const ENDPOINT = '/api/public-catalog';
/** Dentro desta janela a mesma aba reaproveita a resposta sem pedir de novo. */
const JANELA_MS = 5 * 60 * 1000;

let atual: { data: PublicCatalog; em: number } | null = null;
let emVoo: Promise<PublicCatalog | null> | null = null;

/** Painel admin lê direto do Firestore: precisa do custo e de dados frescos. */
export function isAdminRoute(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
}

function valido(x: unknown): x is PublicCatalog {
  const c = x as PublicCatalog | null;
  return !!c && Array.isArray(c.products?.items) && Array.isArray(c.products?.deleted) && typeof c.content === 'object';
}

/** Busca o catálogo público. `null` quando o endpoint não responde — quem
 *  chama decide o fallback. Pedidos simultâneos compartilham a mesma busca. */
export function fetchPublicCatalog(force = false): Promise<PublicCatalog | null> {
  if (!force && atual && Date.now() - atual.em < JANELA_MS) return Promise.resolve(atual.data);
  if (emVoo) return emVoo;
  emVoo = (async () => {
    try {
      const res = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
      if (!res.ok) return atual?.data ?? null;
      const data: unknown = await res.json();
      if (!valido(data)) return atual?.data ?? null;
      atual = { data, em: Date.now() };
      return data;
    } catch {
      return atual?.data ?? null;
    } finally {
      emVoo = null;
    }
  })();
  return emVoo;
}

/** Só para testes. */
export function __resetPublicCatalog(): void {
  atual = null;
  emVoo = null;
}
