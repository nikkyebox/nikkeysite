// Leitura pública do catálogo de produtos via REST do Firestore (mesmo caminho
// que o site usa no client). Compartilhado entre sitemap.js e merchant-feed.js —
// não duplicar este parser em cada endpoint.

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || '';

export function parseValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('mapValue' in v) return parseFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  return undefined;
}

export function parseFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = parseValue(v);
  return out;
}

export function escapeXml(s) {
  return String(s || '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

export async function fetchProducts() {
  if (!FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID não configurado');
  const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/products?pageSize=300`;
  const all = [];
  let pageToken = '';
  do {
    const url = pageToken ? `${base}&pageToken=${pageToken}` : base;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Firestore read failed: ' + res.status);
    const data = await res.json();
    (data.documents || []).forEach(doc => {
      const id = doc.name.split('/').pop();
      all.push({ id, ...parseFields(doc.fields || {}) });
    });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
}

// Catálogo internacional: some produtos só podem ser entregues dentro do Japão
// e não devem aparecer em sitemap/feeds voltados a clientes de fora.
//
// `__deleted` é obrigatório aqui. O painel apaga produto por soft delete: o
// documento fica no Firestore como lápide para que os navegadores com cache
// aprendam a remoção pelo delta (`src/services/productService.ts:remove`). Como
// este módulo lê a coleção crua, 29 produtos já apagados continuavam sendo
// anunciados no Google — e cada clique caía em "produto não encontrado", que é
// dinheiro de anúncio queimado e motivo de reprovação no Merchant Center.
export function isVisibleInternationally(p) {
  return !p.hidden && !p.__deleted && p.deliveryRestrict !== 'japan-only';
}
