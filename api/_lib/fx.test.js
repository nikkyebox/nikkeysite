// Cotação única do servidor: `fx_rates/current` guarda a atual e a anterior;
// o `ratesId` do cliente só escolhe entre elas.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const injected = vi.hoisted(() => ({ db: null, fetch: vi.fn() }));

vi.mock('./firebase-admin.js', () => ({ adminDb: () => injected.db }));

const { getFxRates, resetFxMemory } = await import('./fx.js');

function fakeDb(inicial) {
  let guardado = inicial;
  const ref = { path: 'fx_rates/current' };
  const snap = (valor) => ({ exists: valor !== undefined, data: () => structuredClone(valor) });
  ref.get = async () => snap(guardado);
  return {
    read: () => structuredClone(guardado),
    collection: () => ({ doc: () => ref }),
    runTransaction: async (callback) => callback({
      get: async () => snap(guardado),
      set: (_ref, valor) => { guardado = structuredClone(valor); },
    }),
  };
}

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const AO_VIVO = { BRL: 0.0350, EUR: 0.0062, USD: 0.0068 };

function respostaAoVivo(rates = AO_VIVO) {
  return { ok: true, json: async () => ({ rates }) };
}

function snapshot(idadeMs) {
  const loadedAt = Date.now() - idadeMs;
  return { id: `open-er-${loadedAt}`, BRL: 0.0345, EUR: 0.0061, USD: 0.0067, source: 'open-er', loadedAt };
}

beforeEach(() => {
  injected.fetch.mockReset().mockResolvedValue(respostaAoVivo());
  vi.stubGlobal('fetch', injected.fetch);
  resetFxMemory();
});

describe('getFxRates: snapshot compartilhado', () => {
  it('sem nada guardado busca a cotação, grava em fx_rates/current e devolve um id', async () => {
    injected.db = fakeDb(undefined);
    const rates = await getFxRates();
    expect(rates.source).toBe('open-er');
    expect(rates.id).toMatch(/^open-er-\d{10,16}$/);
    expect(rates.BRL).toBe(AO_VIVO.BRL);
    expect(injected.db.read().current.id).toBe(rates.id);
    expect(injected.db.read().previous).toBeNull();
  });

  it('cotação atual ainda fresca (menos de 30 min) é reaproveitada, sem nova busca', async () => {
    const atual = snapshot(10 * MIN);
    injected.db = fakeDb({ current: atual, previous: null });
    const rates = await getFxRates();
    expect(rates.id).toBe(atual.id);
    expect(injected.fetch).not.toHaveBeenCalled();
  });

  it('cotação vencida (mais de 30 min) é renovada e a antiga vira a anterior, aceita pelo ratesId', async () => {
    const velha = snapshot(40 * MIN);
    injected.db = fakeDb({ current: velha, previous: null });
    const nova = await getFxRates();
    expect(nova.id).not.toBe(velha.id);
    expect(injected.db.read().previous.id).toBe(velha.id);
    resetFxMemory();
    expect((await getFxRates(velha.id)).id).toBe(velha.id);
    expect((await getFxRates(nova.id)).id).toBe(nova.id);
  });

  it('id expirado (anterior com mais de 2 h) ou inexistente cai na cotação atual', async () => {
    const atual = snapshot(5 * MIN);
    const expirada = snapshot(3 * HORA);
    injected.db = fakeDb({ current: atual, previous: expirada });
    expect((await getFxRates(expirada.id)).id).toBe(atual.id);
    expect((await getFxRates('open-er-1234567890123')).id).toBe(atual.id);
    expect((await getFxRates('')).id).toBe(atual.id);
  });

  it('serviço de câmbio fora do ar: usa a última cotação real, mesmo vencida', async () => {
    const velha = snapshot(2 * HORA);
    injected.db = fakeDb({ current: velha, previous: null });
    injected.fetch.mockRejectedValue(new Error('fora do ar'));
    const rates = await getFxRates();
    expect(rates.id).toBe(velha.id);
    expect(rates.source).toBe('open-er');
  });

  it('sem cotação guardada e serviço fora do ar: tabela fixa, marcada como fallback', async () => {
    injected.db = fakeDb(undefined);
    injected.fetch.mockRejectedValue(new Error('fora do ar'));
    const rates = await getFxRates();
    expect(rates.source).toBe('fallback');
    expect(rates.id).toMatch(/^fallback-\d{10,16}$/);
    expect(injected.db.read()).toBeUndefined();
  });
});
