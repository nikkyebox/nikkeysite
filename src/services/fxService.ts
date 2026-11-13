// Cotação cambial ao vivo: converte ¥ → R$/€/$ via /api/wise-rate, que aplica a
// mesma cadeia usada para cobrar (open.er-api → fixo) e informa a origem.
// Wise foi removida da cadeia (endpoint público fechado, e intermitente
// entre invocações serverless — ver api/_lib/fx.js). Taxa PS (noBuffer=true)
// nunca tem margem — exibe o ¥ exato.
import { safeStorage } from '@/utils/storage';
import {
  FX_BUFFER_YEN,
  RATE_CUSHION_FALLBACK,
  yenToDisplay,
} from '../../shared/money.js';

// Quando a taxa vem da própria Wise: sem cushion — a taxa já bate com o app.
// Quando usa fallback (open.er-api, atualização diária): +4% cobre a defasagem.
const RATE_CUSHION_WISE = 0;
// Fallback: ¥→BRL ≈ 1/28, ¥→EUR ≈ 0.16/28, ¥→USD ≈ 1/150
const FALLBACK = { BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150 };
const CACHE_KEY = 'fx_rates';

type Rates = { BRL: number; EUR: number; USD: number };

let _rates: Rates = { ...FALLBACK };
let _source: 'wise' | 'open-er' | 'cache' | 'fallback' = 'fallback';
// Id da cotação do servidor (`fx_rates/current`). Vai junto no pedido para o
// servidor cobrar com a mesma taxa que montou estes preços. Vazio quando a
// taxa não veio do servidor (cache antigo, open.er-api direto ou fixa).
let _ratesId = '';

try {
  const c = JSON.parse(safeStorage.getItem(CACHE_KEY) || 'null');
  if (c?.rates?.BRL && c?.rates?.EUR) {
    _rates = { ...FALLBACK, ...c.rates }; // USD pode faltar em cache antigo
    _source = 'cache';
    _ratesId = typeof c.id === 'string' ? c.id : '';
  }
} catch { /* ignore */ }

export { FX_BUFFER_YEN };

/** Taxas atuais (¥→BRL, ¥→EUR, ¥→USD). */
export const getRates = (): Rates => _rates;
export const getRateSource = () => _source;
export const getRatesId = () => _ratesId;

/**
 * Adota a cotação que o servidor devolveu ao recusar o pedido (`price_changed`):
 * é a mesma que ele usa para cobrar, então a tela passa a mostrar o total real.
 */
export function applyServerRates(rates: Rates, id: string): void {
  if (!(rates?.BRL > 0 && rates?.EUR > 0 && rates?.USD > 0)) return;
  _rates = { BRL: rates.BRL, EUR: rates.EUR, USD: rates.USD };
  _source = 'open-er';
  _ratesId = id;
  safeStorage.setItem(CACHE_KEY, JSON.stringify({
    date: new Date().toISOString().slice(0, 10), rates: _rates, source: 'open-er', id: _ratesId,
  }));
}

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
  // A conta é a de `shared/money.js` (vitrine, checkout e servidor usam a mesma).
  return yenToDisplay(yen, currency, { ..._rates, source: _source }, { exact: noBuffer });
}

/** Busca cotação: `/api/wise-rate` (cadeia completa no servidor) → open.er-api.com. */
export async function loadFxRates(): Promise<Rates> {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Endpoint próprio: mesma cadeia que o servidor usa para cobrar
  //    (open.er-api → fixo), cacheada 10 min. `source` nunca mais vem 'wise'
  //    (removida — ver api/_lib/fx.js), mas o cushion continua correto
  //    porque a checagem abaixo trata qualquer outra origem como fallback.
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
        _ratesId = typeof data?.id === 'string' ? data.id : '';
        safeStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, rates: _rates, source, id: _ratesId }));
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
      _ratesId = typeof cached.id === 'string' ? cached.id : '';
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
      // Não é a cotação do servidor: o pedido sai com a dele (ver price_changed).
      _ratesId = '';
      safeStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, rates: _rates, source: 'open-er', id: '' }));
    }
  } catch { _source = 'fallback'; }

  return _rates;
}
