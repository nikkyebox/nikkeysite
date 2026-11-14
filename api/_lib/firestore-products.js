// Leitura pública do catálogo de produtos via REST do Firestore (mesmo caminho
// que o site usa no client). Compartilhado entre sitemap.js e merchant-feed.js —
// não duplicar este parser em cada endpoint.

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

// Lê com o Admin SDK: a coleção `products` não é mais pública no Firestore
// (o custo de aquisição mora nela). Quem chama aqui só usa campos públicos.
export async function fetchProducts() {
  const { adminDb } = await import('./firebase-admin.js');
  const snap = await adminDb().collection('products').get();
  const all = [];
  // Timestamps viram ISO, como chegavam pela API REST (`timestampValue`).
  const plain = (v) => {
    if (v === null || v === undefined) return v;
    if (typeof v?.toDate === 'function') return v.toDate().toISOString();
    if (Array.isArray(v)) return v.map(plain);
    if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
    return v;
  };
  snap.forEach((d) => all.push({ id: d.id, ...plain(d.data()) }));
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
