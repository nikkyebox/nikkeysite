import { describe, expect, it } from 'vitest';
import { fromCdnUrl, toCdnUrl } from '@/utils/mediaUrl';

const BUCKET = 'nikkeybox.firebasestorage.app';
const storage = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=abc`;

describe('mediaUrl', () => {
  it('troca a URL do Storage por /media na pasta products', () => {
    expect(toCdnUrl(storage('products/p1/17-abc.webp'))).toBe('/media/products/p1/17-abc.webp');
  });

  it('deixa intactas URLs de outro bucket, de outra pasta ou externas', () => {
    const outroBucket = `https://firebasestorage.googleapis.com/v0/b/outro/o/${encodeURIComponent('products/p/a.webp')}`;
    expect(toCdnUrl(outroBucket)).toBe(outroBucket);
    expect(toCdnUrl(storage('users/u1/a.webp'))).toBe(storage('users/u1/a.webp'));
    expect(toCdnUrl('https://exemplo.com/a.jpg')).toBe('https://exemplo.com/a.jpg');
  });

  it('não aceita caminho com ..', () => {
    const url = storage('products/../users/a.webp');
    expect(toCdnUrl(url)).toBe(url);
  });

  it('volta do CDN para a URL canônica do Storage', () => {
    expect(fromCdnUrl('/media/products/p1/a.webp')).toBe(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent('products/p1/a.webp')}?alt=media`,
    );
    expect(fromCdnUrl('https://x/y.jpg')).toBe('https://x/y.jpg');
    expect(fromCdnUrl('/media/products/../x')).toBe('/media/products/../x');
  });
});
