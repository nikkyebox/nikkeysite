// Proxy serverless para taxa de câmbio da Wise em tempo real.
// Tenta primeiro o endpoint público da Wise (sem auth).
// Se WISE_API_TOKEN estiver configurado no Vercel, usa autenticado como fallback.
// Retorna: { JPY_BRL: number, JPY_EUR: number, JPY_USD: number, source: 'wise', ts: number }

const WISE_API = 'https://api.wise.com/v1/rates';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

let _cache = null;

async function fetchWiseRate(source, target, token) {
  const headers = { 'User-Agent': 'NikkeyBox/1.0' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${WISE_API}?source=${source}&target=${target}`, { headers });
  if (!res.ok) throw new Error(`Wise ${source}→${target}: HTTP ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [data];
  const entry = arr.find(r => r.source === source && r.target === target);
  if (!entry?.rate) throw new Error(`Rate not found in response`);
  return entry.rate;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, max-age=600');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) {
    return res.json(_cache);
  }

  const token = process.env.WISE_API_TOKEN || null; // opcional

  try {
    const [brl, eur, usd] = await Promise.all([
      fetchWiseRate('JPY', 'BRL', token),
      fetchWiseRate('JPY', 'EUR', token),
      fetchWiseRate('JPY', 'USD', token),
    ]);

    _cache = { JPY_BRL: brl, JPY_EUR: eur, JPY_USD: usd, source: 'wise', ts: Date.now() };
    return res.json(_cache);
  } catch (err) {
    console.error('[wise-rate] Error:', err.message);
    return res.status(502).json({ error: err.message });
  }
}
