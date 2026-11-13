import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRewrite, loadRewrites, parseBody } from './vercel-dev-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('loadRewrites', () => {
  it('lê só reescritas literais de vercel.json (o catch-all de regex fica de fora)', () => {
    const rewrites = loadRewrites(root);
    expect(rewrites.some((r) => r.source === '/api/admin-session')).toBe(true);
    expect(rewrites.some((r) => r.source.includes('(?!'))).toBe(false);
  });
});

describe('applyRewrite', () => {
  const rewrites = [
    { source: '/api/admin-session', destination: '/api/admin?action=session' },
    { source: '/feed.xml', destination: '/api/feed?region=br&format=xml' },
  ];

  it('mapeia o destino e mantém os parâmetros do destino', () => {
    const out = applyRewrite('/api/admin-session', '', rewrites);
    expect(out).toEqual({ pathname: '/api/admin', search: '?action=session' });
  });

  it('soma a query do cliente à do destino', () => {
    const out = applyRewrite('/feed.xml', '?utm=x', rewrites);
    expect(new URLSearchParams(out.search).get('region')).toBe('br');
    expect(new URLSearchParams(out.search).get('utm')).toBe('x');
  });

  it('deixa a URL como está quando não há reescrita', () => {
    expect(applyRewrite('/api/orders', '?action=create', rewrites)).toEqual({
      pathname: '/api/orders',
      search: '?action=create',
    });
  });
});

describe('parseBody', () => {
  it('interpreta JSON', () => {
    expect(parseBody(Buffer.from('{"a":1}'), 'application/json; charset=utf-8')).toEqual({ a: 1 });
  });

  it('interpreta form-urlencoded', () => {
    expect(parseBody(Buffer.from('a=1&b=two'), 'application/x-www-form-urlencoded')).toEqual({ a: '1', b: 'two' });
  });

  it('corpo vazio vira undefined', () => {
    expect(parseBody(Buffer.alloc(0), 'application/json')).toBeUndefined();
  });

  it('JSON inválido volta como texto, sem derrubar a requisição', () => {
    expect(parseBody(Buffer.from('{oops'), 'application/json')).toBe('{oops');
  });
});
