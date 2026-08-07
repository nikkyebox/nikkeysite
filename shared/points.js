// Pontos de fidelidade — a MESMA conta na tela do checkout e no servidor.
//
// Mora em `shared/` pelo mesmo motivo que `pricing.js`: `src` não pode importar
// de `api/_lib`, e `src/services/pointsService.ts` puxa o Firebase, então o
// servidor também não pode importar de lá. Sem um lugar comum, viram duas
// cópias — e foi exatamente o que aconteceu: a tela prometia 100 pontos e o
// servidor creditava 85 quando havia cupom e pagamento em PIX.

/** 1 ponto a cada ¥100 gastos em produto. */
export const POINTS_PER_100_YEN = 1;

/** Um ponto vale ¥1 de desconto no resgate. */
export const YEN_PER_POINT = 1;

export function pointsForSpendYen(yen) {
  return Math.max(0, Math.floor((Number(yen) || 0) / 100) * POINTS_PER_100_YEN);
}

/**
 * Níveis de pontos — quanto mais o cliente compra, mais ponto cada ¥100 rende.
 *
 * Patamares como DADO, não como cadeia de `if`: o dono muda faixa e
 * multiplicador com frequência, e mexer numa lista é mais seguro do que mexer
 * em ramificação. Ordem CRESCENTE — a tela desenha os três em sequência e o
 * cálculo do próximo nível depende disso.
 *
 * O `id` é a chave de tradução e do troféu na tela; o nome em si não mora aqui
 * porque `shared/` é usado pelo servidor, que não tem idioma.
 *
 * O gasto que conta é só mercadoria — taxa do personal shopper e frete ficam
 * de fora, pela mesma razão que não geram ponto: são serviço, não compra.
 */
export const TIERS = [
  { id: 'bronze', minSpendYen: 0, multiplier: 1 },
  { id: 'prata', minSpendYen: 50000, multiplier: 2 },
  { id: 'ouro', minSpendYen: 100000, multiplier: 3 },
];

/** Janela do gasto: o mês atual mais os 2 anteriores. */
export const SPEND_WINDOW_MONTHS = 3;

/** Nível atingido por um gasto acumulado na janela (o mais alto alcançado). */
export function currentTier(spendYen) {
  const gasto = Math.max(0, Number(spendYen) || 0);
  let atingido = TIERS[0];
  for (const tier of TIERS) {
    if (gasto >= tier.minSpendYen) atingido = tier;
  }
  return atingido;
}

/** Multiplicador de pontos para um gasto acumulado na janela: 1, 2 ou 3. */
export function pointsMultiplierForSpend(spendYen) {
  return currentTier(spendYen).multiplier;
}

/**
 * Onde o cliente está e quanto falta para subir — o que a tela do perfil
 * mostra. Mora aqui junto dos patamares: quem mudar a faixa muda a barra de
 * progresso no mesmo lugar, sem uma segunda conta para desencontrar.
 *
 * No topo devolve `next: null` e `percent: 100` — não existe "faltando" para
 * quem já está no nível máximo.
 */
export function tierProgress(spendYen) {
  const gasto = Math.max(0, Number(spendYen) || 0);
  const tier = currentTier(gasto);
  const next = TIERS.find((candidato) => candidato.minSpendYen > gasto) ?? null;
  if (!next) return { spendYen: gasto, tier, next: null, remainingYen: 0, percent: 100 };
  const faixa = next.minSpendYen - tier.minSpendYen;
  return {
    spendYen: gasto,
    tier,
    next,
    remainingYen: next.minSpendYen - gasto,
    // Teto de 99 enquanto falta subir: com arredondamento, ¥49.999 daria 100% e
    // a barra apareceria cheia ainda em bronze. Barra cheia = nível alcançado.
    percent: Math.max(0, Math.min(99, Math.floor(((gasto - tier.minSpendYen) / faixa) * 100))),
  };
}

/**
 * Início da janela de gasto: meia-noite no Japão no primeiro dia de 2 meses
 * atrás.
 *
 * A janela é por MÊS-CALENDÁRIO, não 90 dias corridos — é o que a loja
 * prometeu: quem compra ¥100.000 em janeiro mantém o x3 em janeiro, fevereiro
 * e março, e em abril a janela (fevereiro a abril) já não enxerga aquela
 * compra. O Japão usa UTC+9 sem horário de verão; deslocar antes de ler ano/mês
 * evita virar o nível no horário UTC enquanto o cliente ainda está em outro dia.
 */
export function spendWindowStart(now = new Date()) {
  const parsed = now instanceof Date ? now : new Date(now);
  const reference = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const tokyo = new Date(reference.getTime() + 9 * 60 * 60 * 1000);
  const year = tokyo.getUTCFullYear();
  const month = tokyo.getUTCMonth();
  const windowMonth = month - (SPEND_WINDOW_MONTHS - 1);
  return new Date(Date.UTC(year, windowMonth, 1) - 9 * 60 * 60 * 1000);
}

const PAID_LOYALTY_STATUSES = new Set(['confirmed', 'processing', 'shipped', 'delivered']);

/** Um pedido só ativa nível depois de o pagamento ter sido confirmado. */
export function isPaidLoyaltyOrder(order) {
  return order?.paymentConfirmed === true
    || order?.fulfillmentState === 'fulfilled'
    || PAID_LOYALTY_STATUSES.has(String(order?.status || '').trim().toLowerCase());
}

function orderTime(order) {
  const iso = new Date(order?.orderDate || '').getTime();
  if (Number.isFinite(iso)) return iso;
  const legacy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(order?.date || '').trim());
  if (!legacy) return NaN;
  const [, day, month, year] = legacy;
  return new Date(`${year}-${month}-${day}T00:00:00+09:00`).getTime();
}

/**
 * Soma somente mercadoria paga dentro da janela. Esta função é compartilhada
 * pelo servidor e pelo perfil para os dois lados nunca divergirem.
 */
export function productSpendInWindowYen(orders, now = new Date()) {
  if (!Array.isArray(orders) || orders.length === 0) return 0;
  const start = spendWindowStart(now).getTime();
  let total = 0;
  for (const order of orders) {
    if (!isPaidLoyaltyOrder(order)) continue;
    const paidAt = orderTime(order);
    if (!Number.isFinite(paidAt) || paidAt < start) continue;
    if (!Array.isArray(order.items)) continue;
    for (const item of order.items) {
      if (item?.freeGift === true) continue;
      const unitYen = Number(item?.unitYen);
      const quantity = Number(item?.quantity);
      if (Number.isFinite(unitYen) && unitYen > 0 && Number.isFinite(quantity) && quantity > 0) {
        total += unitYen * quantity;
      }
    }
  }
  return Math.max(0, Math.round(total));
}

/**
 * Pontos do pedido.
 *
 * Conta sobre o valor CHEIO dos produtos: cupom e desconto de pagamento não
 * cortam ponto. Quem compra ¥10.000 ganha 100 pontos, tenha usado cupom ou não
 * — é o que a tela sempre prometeu, e é a promessa que a loja escolheu manter.
 *
 * O que sai da base é só o que foi pago COM pontos. Sem isso o resgate se
 * pagaria sozinho: ¥1.000 em pontos viraria ¥1.000 de compra que devolve mais
 * 10 pontos, indefinidamente.
 *
 * Frete e taxa do personal shopper nunca entraram — pontos são sobre mercadoria.
 *
 * O multiplicador vem do nível do cliente (`pointsMultiplierForSpend`) e
 * multiplica o PONTO, não a base em ienes: "2 pontos por ¥100" é o que foi
 * prometido. Multiplicar a base mudaria o arredondamento — ¥150 renderia 3
 * pontos em vez de 2. Default 1 mantém idêntica toda chamada de 2 argumentos.
 */
export function earnedPointsForOrder(productSubtotalYen, pointsDiscountYen = 0, multiplier = 1) {
  const bruto = Math.max(0, Number(productSubtotalYen) || 0);
  const pago = Math.max(0, Number(pointsDiscountYen) || 0);
  const fator = Math.max(1, Math.floor(Number(multiplier) || 1));
  return pointsForSpendYen(Math.max(0, bruto - pago)) * fator;
}
