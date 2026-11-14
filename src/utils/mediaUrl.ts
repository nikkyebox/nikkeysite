// Fotos de produto pelo CDN da Vercel.
//
// No Firestore a foto fica com a URL canônica do Firebase Storage (é o que o
// feed do Google Merchant e o servidor usam). Na vitrine ela vira
// `/media/products/...`, que a Vercel serve do cache da borda — o Firebase só
// é consultado na primeira vez que cada foto é pedida (ver api/_handlers/media.js).
import type { Product } from '@/types';

const BUCKET = 'nikkeybox.firebasestorage.app';
const STORAGE_RE = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?#]+)/;
const SAFE_PATH = /^products\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/;
const PREFIX = '/media/';
const isSafe = (path: string) => SAFE_PATH.test(path) && !path.split('/').includes('..');

/** URL do Firebase Storage (pasta products/) → caminho no CDN. Outras ficam como estão. */
export function toCdnUrl(url: string): string {
  const m = STORAGE_RE.exec(url);
  if (!m || m[1] !== BUCKET) return url;
  let path: string;
  try {
    path = decodeURIComponent(m[2]);
  } catch {
    return url;
  }
  return isSafe(path) ? PREFIX + path : url;
}

/** Caminho no CDN → URL canônica do Firebase Storage (para gravar no Firestore). */
export function fromCdnUrl(url: string): string {
  if (!url.startsWith(PREFIX)) return url;
  const path = url.slice(PREFIX.length);
  if (!isSafe(path)) return url;
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
}

export const isCdnUrl = (url: unknown): boolean => typeof url === 'string' && url.startsWith(PREFIX + 'products/');

function mapImages(p: Product, fn: (u: string) => string): Product {
  return {
    ...p,
    image: p.image ? fn(p.image) : p.image,
    thumbnail: p.thumbnail ? fn(p.thumbnail) : p.thumbnail,
    gallery: Array.isArray(p.gallery) ? p.gallery.map((g) => (typeof g === 'string' ? fn(g) : g)) : p.gallery,
  };
}

export const withCdnImages = (p: Product): Product => mapImages(p, toCdnUrl);
export const withStorageImages = (p: Product): Product => mapImages(p, fromCdnUrl);
