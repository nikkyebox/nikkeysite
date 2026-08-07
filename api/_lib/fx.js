const FALLBACK = { BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150 };
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = null;

async function wiseRate(target) {
  const headers = { 'User-Agent': 'JapanExpress/1.0' };
  if (process.env.WISE_API_TOKEN) headers.Authorization = `Bearer ${process.env.WISE_API_TOKEN}`;
  const response = await fetch(`https://api.wise.com/v1/rates?source=JPY&target=${target}`, { headers });
  if (!response.ok) throw new Error('wise_unavailable');
  const payload = await response.json();
  const entries = Array.isArray(payload) ? payload : [payload];
  const rate = Number(entries.find((entry) => entry.source === 'JPY' && entry.target === target)?.rate);
  if (!(rate > 0)) throw new Error('wise_invalid_rate');
  return rate;
}

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
    const [BRL, EUR, USD] = await Promise.all(['BRL', 'EUR', 'USD'].map(wiseRate));
    cache = { BRL, EUR, USD, source: 'wise', loadedAt: Date.now() };
    return cache;
  } catch {
    try {
      const rates = await openExchangeRates();
      cache = { ...rates, source: 'open-er', loadedAt: Date.now() };
      return cache;
    } catch {
      cache = { ...FALLBACK, source: 'fallback', loadedAt: Date.now() };
      return cache;
    }
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
