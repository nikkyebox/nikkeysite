// Cotação cambial ao vivo: converte ¥ → R$/€/$ via /api/wise-rate, que aplica a
// mesma cadeia usada para cobrar (Wise → open.er-api → fixo) e informa a origem.
// Taxa PS (noBuffer=true) nunca tem margem — exibe o ¥ exato.
import { safeStorage } from '@/utils/storage';

const BUFFER_YEN = 5;    // margem fixa somada ao ¥ (proteção em itens pequenos)
// Quando a taxa vem da própria Wise: sem cushion — a taxa já bate com o app.
// Quando usa fallback (open.er-api, atualização diária): +4% cobre a defasagem.
const RATE_CUSHION_WISE = 0;
const RATE_CUSHION_FALLBACK = 0.04;
// Fallback: ¥→BRL ≈ 1/28, ¥→EUR ≈ 0.16/28, ¥→USD ≈ 1/150
const FALLBACK = { BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150 };
const CACHE_KEY = 'fx_rates';

type Rates = { BRL: number; EUR: number; USD: number };

let _rates: Rates = { ...FALLBACK };
let _source: 'wise' | 'open-er' | 'cache' | 'fallback' = 'fallback';

try {
  const c = JSON.parse(safeStorage.getItem(CACHE_KEY) || 'null');
  if (c?.rates?.BRL && c?.rates?.EUR) {
    _rates = { ...FALLBACK, ...c.rates }; // USD pode faltar em cache antigo
    _source = 'cache';
  }
} catch { /* ignore */ }

export const FX_BUFFER_YEN = BUFFER_YEN;

/** Taxas atuais (¥→BRL, ¥→EUR, ¥→USD). */
export const getRates = (): Rates => _rates;
export const getRateSource = () => _source;

function rateFor(currency: string): number {
  if (currency === 'BRL') return _rates.BRL;
  if (currency === 'EUR') return _rates.EUR;
  return _rates.USD;
}

/** Converte BRL/EUR/USD de volta para ¥, desfazendo o mesmo cushion aplicado em convertYen. */
export function yenFromConverted(amount: number, currency: string): number {
  if (currency === 'JPY') return Math.round(amount);
  const baseRate = rateFor(currency);
  if (!baseRate) return 0;
  const cushion = _source === 'wise' ? RATE_CUSHION_WISE : RATE_CUSHION_FALLBACK;
  return Math.round(amount / (baseRate * (1 + cushion)));
}

/** Converte ¥ para a moeda informada (BRL/EUR/USD).
 *  noBuffer=true omite todas as margens — use para taxas fixas (ex.: taxa PS). */
export function convertYen(yen: number, currency: string, noBuffer = false): number {
  if (currency === 'JPY') return Math.round(yen);
  if (!yen || yen <= 0) return 0;
  const baseRate = rateFor(currency);
  const cushion = _source === 'wise' ? RATE_CUSHION_WISE : RATE_CUSHION_FALLBACK;
  const rate = noBuffer ? baseRate : baseRate * (1 + cushion);
  return Math.round((yen + (noBuffer ? 0 : BUFFER_YEN)) * rate);
}

/** Busca cotação: `/api/wise-rate` (cadeia completa no servidor) → open.er-api.com. */
export async function loadFxRates(): Promise<Rates> {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Endpoint próprio: mesma cadeia que o servidor usa para cobrar (Wise →
  //    open.er-api → fixo), cacheada 10 min. Confiamos no `source` que ele
  //    informa: assumir 'wise' aqui zeraria o cushion de 4% e derrubaria todos
  //    os preços sempre que a taxa viesse, na verdade, do open.er-api.
  try {
    const res = await fetch('/api/wise-rate');
    if (res.ok) {
      const data = await res.json();
      const brl = Number(data?.JPY_BRL);
      const eur = Number(data?.JPY_EUR);
      const usd = Number(data?.JPY_USD);
      const source = data?.source === 'wise' ? 'wise' : 'open-er';
      // 'fallback' = servidor não alcançou nenhuma cotação viva; tenta direto.
      if (brl > 0 && eur > 0 && data?.source !== 'fallback') {
        _rates = { BRL: brl, EUR: eur, USD: usd > 0 ? usd : FALLBACK.USD };
        _source = source;
        safeStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, rates: _rates, source }));
        return _rates;
      }
    }
  } catch { /* cai no próximo */ }

  // 2. Cache local ainda válido para hoje
  try {
    const cached = JSON.parse(safeStorage.getItem(CACHE_KEY) || 'null');
    if (cached?.date === today && cached?.rates?.BRL && cached?.rates?.EUR) {
      _rates = { ...FALLBACK, ...cached.rates };
      _source = cached.source === 'wise' ? 'wise' : 'cache';
      return _rates;
    }
  } catch { /* ignore */ }

  // 3. open.er-api.com (gratuito, atualização diária)
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/JPY');
    const data = await res.json();
    const brl = Number(data?.rates?.BRL);
    const eur = Number(data?.rates?.EUR);
    const usd = Number(data?.rates?.USD);
    if (brl > 0 && eur > 0) {
      _rates = { BRL: brl, EUR: eur, USD: usd > 0 ? usd : FALLBACK.USD };
      _source = 'open-er';
      safeStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, rates: _rates, source: 'open-er' }));
    }
  } catch { _source = 'fallback'; }

  return _rates;
}
