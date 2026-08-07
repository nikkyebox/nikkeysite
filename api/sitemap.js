// Sitemap dinâmico: páginas estáticas + TODOS os produtos (/produto/:id).
// Antes o sitemap era estático e não listava produtos — o Google não descobria as
// páginas que mais convertem. Produtos são públicos no Firestore (leitura REST sem auth).
import { fetchProducts, escapeXml, isVisibleInternationally } from './_lib/firestore-products.js';

const SITE_ORIGIN = 'https://nikkeybox-store.com';

function toIso(ts) {
  try {
    const d = ts ? new Date(ts) : new Date();
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// Páginas estáticas públicas. Rotas internas (checkout, perfil, admin...) não entram.
const STATIC_PAGES = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/produtos', priority: '0.9', changefreq: 'daily' },
  { loc: '/ofertas', priority: '0.8', changefreq: 'weekly' },
  { loc: '/frete', priority: '0.7', changefreq: 'monthly' },
  { loc: '/como-funciona', priority: '0.6', changefreq: 'monthly' },
  { loc: '/sobre', priority: '0.6', changefreq: 'monthly' },
  { loc: '/faca-seu-pedido', priority: '0.6', changefreq: 'monthly' },
  { loc: '/empresas', priority: '0.5', changefreq: 'monthly' },
  { loc: '/afiliado', priority: '0.5', changefreq: 'monthly' },
  { loc: '/rastrear', priority: '0.5', changefreq: 'monthly' },
  { loc: '/promocao', priority: '0.6', changefreq: 'weekly' },
  { loc: '/vlog', priority: '0.5', changefreq: 'weekly' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const products = await fetchProducts();
    // Mesmo filtro do feed: escondidos e "japan-only" não entram no catálogo internacional
    const visible = products.filter(isVisibleInternationally);

    const staticUrls = STATIC_PAGES.map(p =>
      `  <url>\n    <loc>${SITE_ORIGIN}${p.loc}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    ).join('\n');

    const productUrls = visible.map(p =>
      `  <url>\n    <loc>${SITE_ORIGIN}/produto/${escapeXml(p.id)}</loc>\n    <lastmod>${toIso(p.updatedAt)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
    ).join('\n');

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${staticUrls}\n${productUrls}\n</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // Cache 6h no CDN — o catálogo não muda a cada minuto
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.status(200).send(xml);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}