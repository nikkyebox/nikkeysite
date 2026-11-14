// Fotos de produto servidas pelo CDN da Vercel (/media/products/...).
//
// Cada arquivo no bucket tem nome único (timestamp + sufixo) e nunca é
// sobrescrito, então a resposta é imutável: a borda guarda por 1 ano e o
// Firebase Storage só é consultado na primeira vez que cada foto é pedida.
//
// Só a pasta `products/` passa por aqui, e só imagens. Vídeos e arquivos acima
// do limite de resposta das funções são redirecionados para o Firebase.

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'nikkeybox.firebasestorage.app';
const MAX_BYTES = 4 * 1024 * 1024; // limite de corpo de resposta da função ~4,5 MB
const SAFE_PATH = /^products\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/;

export function storageUrl(path) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
}

export function isSafeMediaPath(path) {
  return SAFE_PATH.test(path) && !path.split('/').includes('..');
}

export default async function media(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const raw = req.query?.p;
  const path = String(Array.isArray(raw) ? raw.join('/') : raw || '');
  if (!isSafeMediaPath(path)) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return res.status(404).end();
  }

  const origin = storageUrl(path);
  let upstream;
  try {
    upstream = await fetch(origin);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).end();
  }

  if (!upstream.ok) {
    // 404 curto na borda: se a foto for enviada depois, aparece logo.
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(upstream.status === 404 || upstream.status === 403 ? 404 : 502).end();
  }

  const type = upstream.headers.get('content-type') || '';
  const declared = Number(upstream.headers.get('content-length') || 0);
  if (!type.startsWith('image/') || declared > MAX_BYTES) {
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.redirect(302, origin);
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  if (body.length > MAX_BYTES) {
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.redirect(302, origin);
  }

  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  return res.status(200).send(req.method === 'HEAD' ? '' : body);
}
