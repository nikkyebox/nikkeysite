/**
 * visitorService
 *
 * Rastreia visitantes únicos por sessão e salva no Firestore:
 * - Total de visitas por dia (analytics_daily/{YYYY-MM-DD})
 * - Contagem por país/cidade via ip-api.com (gratuito, sem chave)
 * - Páginas mais visitadas (analytics_pages/{slug})
 * - Produtos mais visualizados (analytics_products/{productId})
 *
 * Usado pelo painel admin em Dashboard → Visitantes.
 */

import { db } from '@/config/firebase';
import { ADMIN_EMAIL, ADMIN_USER_ID } from '@/config/admin';
import {
  collection, query, orderBy, limit, getDocs,
} from 'firebase/firestore';

const SESSION_KEY = 'je_visitor_tracked';

function isAdminLoggedIn(): boolean {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return false;
    const u = JSON.parse(raw);
    return u?.id === ADMIN_USER_ID || u?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  } catch { return false; }
}

// Páginas conhecidas (slug → label legível)
const PAGE_LABELS: Record<string, string> = {
  '/': 'Início',
  '/produtos': 'Catálogo de Produtos',
  '/carrinho': 'Carrinho',
  '/checkout': 'Checkout',
  '/frete': 'Frete',
  '/como-funciona': 'Como Funciona',
  '/empresas': 'Empresas (B2B)',
  '/sobre': 'Quem Somos',
  '/promocao': 'Promoção',
  '/perfil': 'Perfil',
  '/ofertas': 'Ofertas',
  '/afiliado': 'Afiliados',
};

export interface DailyStats {
  date: string;
  total: number;
  countries: Record<string, number>; // { 'BR': 42, 'PT': 8, ... }
  cities: Record<string, number>;    // { 'São Paulo': 20, ... }
}

export interface GeoInfo {
  country: string;      // 'Brazil'
  countryCode: string;  // 'BR'
  city: string;         // 'São Paulo'
  regionName: string;   // 'São Paulo'
}

async function getGeoInfo(): Promise<GeoInfo | null> {
  try {
    // /api/geo usa os headers de geolocalização do Vercel (mesma origem, HTTPS)
    const res = await fetch('/api/geo', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.countryCode) return null;
    return {
      country: data.countryCode,
      countryCode: data.countryCode,
      city: data.city || '',
      regionName: data.regionName || '',
    };
  } catch {
    return null;
  }
}


type AnalyticsEvent =
  | { type: 'visit'; countryCode?: string; city?: string }
  | { type: 'page'; slug: string; label: string }
  | { type: 'product'; productId: string; productName: string };

async function postAnalytics(event: AnalyticsEvent): Promise<void> {
  const response = await fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    keepalive: true,
  });
  if (!response.ok) throw new Error('analytics_request_failed');
}

export const visitorService = {
  /**
   * Registra uma visita (uma vez por sessão do browser).
   * Chamado no App.tsx na montagem inicial.
   * Não rastreia visitas do admin.
   */
  async trackVisit(): Promise<void> {
    // A gravação ocorre pela API com rate limit e Admin SDK; não depende do SDK cliente.
    // Não rastreia visitas do admin
    if (isAdminLoggedIn()) return;
    // Só rastreia uma vez por sessão (não por página)
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');

    try {
    const geo = await getGeoInfo();

      await postAnalytics({
        type: 'visit',
        countryCode: geo?.countryCode,
        city: geo?.city,
      });
    } catch (e) {
      console.warn('[visitor] trackVisit falhou:', e);
    }
  },

  /** Busca os últimos N dias de estatísticas. */
  async getRecentDays(days = 30): Promise<DailyStats[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, 'analytics_daily'),
        orderBy('date', 'desc'),
        limit(days)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as DailyStats).reverse();
    } catch {
      return [];
    }
  },

  /**
   * Registra uma visualização de página.
   * Chamado no router a cada mudança de rota.
   */
  async trackPage(pathname: string): Promise<void> {
    // A API aceita eventos mesmo quando o SDK cliente do Firestore está indisponível.
    // Ignora rotas de admin e autenticação, e não rastreia o admin
    if (pathname.startsWith('/admin') || pathname.startsWith('/login') || isAdminLoggedIn()) return;
    try {
      const slug = pathname.startsWith('/produto/') ? '/produto/:id' : pathname;
      const label = PAGE_LABELS[slug] || slug;
      await postAnalytics({ type: 'page', slug, label });
    } catch { /* silencioso */ }
  },

  /**
   * Registra uma visualização de produto.
   * Chamado na página /produto/:id.
   */
  async trackProduct(productId: string, productName: string): Promise<void> {
    // A API aceita eventos mesmo quando o SDK cliente do Firestore está indisponível.
    // Não rastreia visualizações do admin
    if (isAdminLoggedIn()) return;
    try {
      await postAnalytics({ type: 'product', productId, productName });
    } catch { /* silencioso */ }
  },

  /** Top páginas mais visitadas. */
  async getTopPages(n = 10): Promise<Array<{ slug: string; label: string; views: number }>> {
    if (!db) return [];
    try {
      const q = query(collection(db, 'analytics_pages'), orderBy('views', 'desc'), limit(n));
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as { slug: string; label: string; views: number });
    } catch { return []; }
  },

  /** Top produtos mais visualizados. */
  async getTopProducts(n = 10): Promise<Array<{ productId: string; productName: string; views: number }>> {
    if (!db) return [];
    try {
      const q = query(collection(db, 'analytics_products'), orderBy('views', 'desc'), limit(n));
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as { productId: string; productName: string; views: number });
    } catch { return []; }
  },

  /** Agrega totais dos últimos N dias. */
  async getSummary(days = 30): Promise<{
    totalVisits: number;
    avgPerDay: number;
    topCountries: Array<{ code: string; count: number }>;
    topCities: Array<{ city: string; count: number }>;
    dailyData: DailyStats[];
  }> {
    const dailyData = await this.getRecentDays(days);
    const totalVisits = dailyData.reduce((s, d) => s + (d.total || 0), 0);
    const avgPerDay = dailyData.length > 0 ? Math.round(totalVisits / dailyData.length) : 0;

    // Agrega países
    const countryMap: Record<string, number> = {};
    const cityMap: Record<string, number> = {};
    dailyData.forEach(d => {
      Object.entries(d.countries || {}).forEach(([k, v]) => { countryMap[k] = (countryMap[k] || 0) + Number(v); });
      Object.entries(d.cities || {}).forEach(([k, v]) => { cityMap[k] = (cityMap[k] || 0) + Number(v); });
    });

    const topCountries = Object.entries(countryMap)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topCities = Object.entries(cityMap)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { totalVisits, avgPerDay, topCountries, topCities, dailyData };
  },
};
