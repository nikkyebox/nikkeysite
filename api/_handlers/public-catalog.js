// Catálogo público servido pelo CDN da Vercel.
//
// O navegador do cliente não lê mais o Firestore para montar a vitrine: lê este
// endpoint, que a borda da Vercel guarda por 60 s (e serve o anterior por até
// 1 dia enquanto revalida). Uma edição no Admin aparece em ~1 min, e o
// Firestore passa a receber uma leitura por minuto — não uma por visitante.
//
// Campos sensíveis (custo de aquisição) ficam SÓ no Firestore: são removidos
// aqui e as regras do Firestore deixam a coleção `products` legível apenas por
// admin.
import { adminDb } from '../_lib/firebase-admin.js';
import { HttpError } from '../_lib/http.js';

/** Campos de produto que nunca saem do servidor. */
export const PRIVATE_PRODUCT_FIELDS = ['cost'];

/** Documentos de conteúdo que a vitrine lê. */
const CONTENT_DOCS = {
  settings: 'siteContent/settings',
  home: 'siteContent/home',
  vlog: 'siteContent/vlog',
  homePromotion: 'siteContent/homePromotion',
};

/** Timestamp do Firestore → ms; objetos e listas recursivamente. */
export function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

export function publicProduct(id, data) {
  const out = { id };
  for (const [k, v] of Object.entries(data)) {
    if (PRIVATE_PRODUCT_FIELDS.includes(k) || k === '__deleted') continue;
    out[k] = toPlain(v);
  }
  return out;
}

export default async function publicCatalog(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const db = adminDb();
    const contentKeys = Object.keys(CONTENT_DOCS);
    const [productsSnap, categoriesSnap, ...contentSnaps] = await Promise.all([
      db.collection('products').get(),
      db.doc('settings/product_categories').get(),
      ...contentKeys.map((k) => db.doc(CONTENT_DOCS[k]).get()),
    ]);

    const items = [];
    const deleted = [];
    let maxMs = 0;
    productsSnap.forEach((d) => {
      const data = d.data();
      const ms = typeof data.updatedAt?.toMillis === 'function' ? data.updatedAt.toMillis() : 0;
      if (ms > maxMs) maxMs = ms;
      if (data.__deleted) deleted.push(d.id);
      else items.push(publicProduct(d.id, data));
    });

    const content = {};
    contentKeys.forEach((k, i) => {
      content[k] = contentSnaps[i].exists ? toPlain(contentSnaps[i].data()) : null;
    });

    const categories = categoriesSnap.exists ? toPlain(categoriesSnap.data().list || []) : [];

    // Borda da Vercel: 60 s fresco, até 1 dia servindo o anterior enquanto
    // revalida em segundo plano. O navegador sempre revalida com a borda.
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=86400');
    return res.status(200).json({
      generatedAt: Date.now(),
      products: { items, deleted, maxMs },
      categories,
      content,
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.statusCode : 500;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json({ error: 'catalog_unavailable' });
  }
}
