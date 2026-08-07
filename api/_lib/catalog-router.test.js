import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  geo: vi.fn(),
  productEnrich: vi.fn(),
  sitemap: vi.fn(),
  wiseRate: vi.fn(),
}));

vi.mock('../_handlers/geo.js', () => ({ default: mocks.geo }));
vi.mock('../_handlers/product-enrich.js', () => ({ default: mocks.productEnrich }));
vi.mock('../_handlers/sitemap.js', () => ({ default: mocks.sitemap }));
vi.mock('../_handlers/wise-rate.js', () => ({ default: mocks.wiseRate }));

import catalog from '../catalog.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('roteador serverless de catálogo', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((handler) => handler.mockReset());
  });

  it('encaminha a ação mantendo request e response originais', async () => {
    const req = { query: { action: 'wise-rate' } };
    const res = response();
    mocks.wiseRate.mockImplementation((_req, responseValue) => responseValue.status(200).json({ source: 'wise' }));

    await catalog(req, res);

    expect(mocks.wiseRate).toHaveBeenCalledWith(req, res);
    expect(res.body).toEqual({ source: 'wise' });
  });

  it('rejeita ação desconhecida sem executar outro handler', async () => {
    const res = response();

    await catalog({ query: { action: 'missing' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_action' });
    Object.values(mocks).forEach((handler) => expect(handler).not.toHaveBeenCalled());
  });
});
