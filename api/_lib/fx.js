const FALLBACK = { BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150 };
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = null;

// A Wise fechou o endpoint público `api.wise.com/v1/rates` (401 mesmo com
// token) e, quando responde, é inconsistente entre invocações serverless
// distintas — uma chamada de preview (`/api/wise-rate`) podia pegar a Wise
// (cushion 0%) enquanto a criação do pedido, segundos depois, caía no
// open.er-api (cushion 4%), cobrando um total diferente do que a tela
// mostrou. Tirar a Wise da cadeia é o que faz cliente e servidor sempre
// convergirem pro mesmo cushion. Ver AUDITORIA.md se ela reabrir o endpoint.
async function openExchangeRates() {
  const response = await fetch('https://open.er-api.com/v6/latest/JPY');
  if (!response.ok) throw new Error('exchange_unavailable');
  const payload = await response.json();
  const rates = {
    BRL: Number(payload?.rates?.BRL),
    EUR: Number(payload?.rates?.EUR),
    USD: Number(payload?.rates?.USD),
  };
  if (!Object.values(rates).every((rate) => rate > 0)) throw new Error('exchange_invalid_rate');
  return rates;
}

export async function getFxRates() {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
  try {
    const rates = await openExchangeRates();
    cache = { ...rates, source: 'open-er', loadedAt: Date.now() };
    return cache;
  } catch {
    cache = { ...FALLBACK, source: 'fallback', loadedAt: Date.now() };
    return cache;
  }
}

export function currencyForCountry(country) {
  if (country === 'Japão') return 'JPY';
  if (country === 'Brasil') return 'BRL';
  const euroCountries = new Set([
    'Alemanha', 'Áustria', 'Bélgica', 'Chipre', 'Croácia', 'Eslováquia', 'Eslovênia',
    'Espanha', 'Estônia', 'Finlândia', 'França', 'Grécia', 'Irlanda', 'Itália',
    'Letônia', 'Lituânia', 'Luxemburgo', 'Malta', 'Países Baixos', 'Portugal',
  ]);
  return euroCountries.has(country) ? 'EUR' : 'USD';
}

export function convertYen(yen, currency, rates, { exact = false } = {}) {
  if (currency === 'JPY') return Math.round(yen);
  const baseRate = Number(rates[currency]);
  const cushion = rates.source === 'wise' ? 0 : 0.04;
  const rate = exact ? baseRate : baseRate * (1 + cushion);
  const buffer = exact ? 0 : 5;
  return Math.round((yen + buffer) * rate * 100) / 100;
}
