import { adminDb } from './firebase-admin.js';

const FALLBACK = { BRL: 1 / 28, EUR: 0.16 / 28, USD: 1 / 150 };

// A cotação é UMA para todas as instâncias do servidor: fica gravada em
// `fx_rates/current` (só o Admin SDK escreve e lê; as regras do Firestore não
// liberam essa coleção ao navegador) e é renovada a cada 30 minutos. Antes cada
// instância tinha a sua (cache de 10 min em memória), então a revisão do pedido
// podia ser calculada com uma taxa e a cobrança, segundos depois, com outra.
//
// A anterior continua aceita por até 2 h quando o cliente informa o `id` com
// que viu os preços (`ratesId`): quem abriu a revisão um pouco antes da troca
// paga exatamente o que viu. O cliente só escolhe entre cotações que o próprio
// servidor buscou — não existe como mandar uma taxa inventada.
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const PREVIOUS_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MEMORY_TTL_MS = 60 * 1000;

let memory = null;

// A Wise fechou o endpoint público `api.wise.com/v1/rates` (401 mesmo com
// token) e, quando responde, é inconsistente entre invocações serverless
// distintas. Fora da cadeia: cliente e servidor sempre convergem para o mesmo
// cushion.
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

/** Cotação ao vivo: open.er-api → fixa. O `id` identifica este snapshot. */
async function liveRates() {
  const loadedAt = Date.now();
  try {
    const rates = await openExchangeRates();
    return { id: `open-er-${loadedAt}`, ...rates, source: 'open-er', loadedAt };
  } catch {
    return { id: `fallback-${loadedAt}`, ...FALLBACK, source: 'fallback', loadedAt };
  }
}

function valid(snapshot) {
  return Boolean(snapshot && typeof snapshot.id === 'string'
    && ['BRL', 'EUR', 'USD'].every((currency) => Number(snapshot[currency]) > 0)
    && Number.isFinite(Number(snapshot.loadedAt)));
}

function fresh(snapshot, now) {
  return valid(snapshot) && snapshot.source !== 'fallback' && now - Number(snapshot.loadedAt) < SNAPSHOT_TTL_MS;
}

async function loadSnapshot() {
  const now = Date.now();
  if (memory && now - memory.checkedAt < MEMORY_TTL_MS) return memory;

  let ref = null;
  let stored = null;
  try {
    ref = adminDb().collection('fx_rates').doc('current');
    const snap = await ref.get();
    stored = snap.exists ? snap.data() : null;
  } catch {
    ref = null;
  }

  let current = valid(stored?.current) ? stored.current : null;
  let previous = valid(stored?.previous) ? stored.previous : null;

  if (!fresh(current, now)) {
    const live = await liveRates();
    if (live.source === 'fallback' && current) {
      // open.er fora do ar: a última cotação real, mesmo vencida, é melhor que
      // a tabela fixa. Não grava nada, tenta de novo no próximo minuto.
      memory = { current, previous, checkedAt: now };
      return memory;
    }
    if (live.source === 'fallback' || !ref) {
      memory = { current: live, previous: current, checkedAt: now };
      return memory;
    }
    try {
      const result = await adminDb().runTransaction(async (transaction) => {
        const latest = await transaction.get(ref);
        const latestData = latest.exists ? latest.data() : null;
        // Outra instância renovou enquanto esta buscava: usa a dela, para
        // todo mundo continuar com a mesma cotação.
        if (fresh(latestData?.current, Date.now())) {
          return { current: latestData.current, previous: valid(latestData.previous) ? latestData.previous : null };
        }
        const next = { current: live, previous: valid(latestData?.current) ? latestData.current : null };
        transaction.set(ref, next);
        return next;
      });
      current = result.current;
      previous = result.previous;
    } catch {
      previous = current;
      current = live;
    }
  }

  memory = { current, previous, checkedAt: now };
  return memory;
}

/** Só para testes: esquece o cache em memória. */
export function resetFxMemory() {
  memory = null;
}

/**
 * Cotação para calcular um pedido. Com `ratesId` (a que o cliente viu na
 * tela), devolve aquela mesma enquanto ainda for a atual ou a anterior recente.
 */
export async function getFxRates(ratesId = '') {
  const { current, previous } = await loadSnapshot();
  if (ratesId && previous && previous.id === ratesId && Date.now() - Number(previous.loadedAt) < PREVIOUS_MAX_AGE_MS) {
    return previous;
  }
  return current;
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

// A conversão ¥ → moeda do cliente mora em shared/money.js (a mesma da vitrine
// e do checkout): valor inteiro, ¥5 de margem por unidade e cushion conforme a
// origem da cotação (`rateCushion`: Wise 0, demais +4%).
export { yenToDisplay, rateCushion } from '../../shared/money.js';
