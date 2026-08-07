/**
 * Reserva de unidade da promoção da home entre criar o pedido e confirmar o
 * pagamento.
 *
 * O problema (resto do CRÍTICO 3 do AUDITORIA.md): `buildQuote` já desconta
 * `homePromotion.reservedCount` do saldo da promoção, mas ninguém gravava esse
 * campo. Dois checkouts simultâneos na última unidade liam o mesmo
 * `soldCount`, os dois passavam na cotação, os dois eram cobrados — e o
 * segundo morria na trava atômica do `fulfillment.js:129`, já com o cartão
 * debitado, indo para `payment_review`.
 *
 * Três decisões importantes:
 *
 * 1. **O estado mora fora de `siteContent/homePromotion`.** Aquele documento é
 *    público para leitura (`firestore.rules`) e é sobrescrito INTEIRO pelo
 *    painel (`PromotionManager.tsx`) e por `Promotion.tsx` — um contador ali
 *    seria zerado por qualquer salvamento do admin, e a lista de reservas
 *    vazaria ids de pedido para o navegador. Daí `promo_state/homePromotion`,
 *    negado a todo mundo nas regras: só o Admin SDK, que as ignora, chega nele.
 *    Como todas as reservas ficam nesse ÚNICO documento, o Firestore serializa
 *    os checkouts concorrentes — que é justamente o que faz a trava funcionar.
 *
 * 2. **Toda reserva tem prazo.** Não existe endpoint de cancelamento de pedido
 *    no servidor: sem prazo, um checkout abandonado seguraria a última unidade
 *    da promoção para sempre. Reserva vencida é ignorada na conta e podada na
 *    escrita seguinte.
 *
 * 3. **A reserva é da RODADA, não da promoção em geral.** O admin troca a
 *    promoção da home no painel, e o `fulfillOrder` promove `nextPromo` sozinho
 *    quando o estoque acaba. Sem identificar a rodada, as reservas da promoção
 *    velha continuariam bloqueando unidades da nova. A chave é
 *    `productId` + `expiresAt`: rodada diferente, reservas ignoradas.
 */

/**
 * Prazo do cartão. O Stripe resolve em minutos — `payment_intent.succeeded` é o
 * único caminho que fecha a venda — e 2h absorvem 3DS repetido e atraso de
 * webhook. Curto de propósito: cartão é o método de maior volume e a maior
 * fonte de checkout abandonado; herdar as 24h dos pontos congelaria a última
 * unidade de uma flash sale por um dia a cada carrinho desistido.
 */
export const PRAZO_RESERVA_CARTAO_MS = 2 * 60 * 60 * 1000;

/**
 * Prazo dos métodos que a loja confirma à mão (`handleConfirmManualPayment`
 * recusa só cartão): PIX, PayPay, transferência bancária, Yucho e Wise. Aqui o
 * relógio não é o do cliente, é o do balcão — quem transfere às 23h só é
 * confirmado na manhã seguinte, e Wise é transferência internacional. 24h é o
 * teto: cobre um dia útil de defasagem sem virar bloqueio indefinido, e é o
 * mesmo teto que `points-hold.js` já escolheu.
 *
 * A assimetria justifica parar aqui em vez de esticar para dois dias: pagamento
 * que chega depois do prazo, com a unidade vendida, cai em `payment_review` —
 * caminho que já existe, já avisa cliente e loja e já marca `refundPending`,
 * ou seja, reversível. Reserva longa demais mata a campanha calada, e isso não
 * tem volta.
 */
export const PRAZO_RESERVA_MANUAL_MS = 24 * 60 * 60 * 1000;

/** Prazo da reserva conforme quem confirma o pagamento: o Stripe ou o balcão. */
export function prazoReserva(paymentMethod) {
  return paymentMethod === 'card' ? PRAZO_RESERVA_CARTAO_MS : PRAZO_RESERVA_MANUAL_MS;
}

/** Documento de estado, só do servidor. O caminho mora aqui e em nenhum outro lugar. */
export function refEstadoPromo(db) {
  return db.collection('promo_state').doc('homePromotion');
}

/**
 * Identidade da rodada da promoção. `expiresAt` entra junto com o produto
 * porque o admin pode reagendar o mesmo produto: é outra rodada, com outro
 * estoque, e as reservas da anterior não valem mais.
 */
export function chaveRodada(homePromotion) {
  if (!homePromotion?.productId) return '';
  return `${homePromotion.productId}|${homePromotion.expiresAt ?? ''}`;
}

function lista(estado) {
  return Array.isArray(estado?.holds) ? estado.holds : [];
}

function vigentes(estado, homePromotion, agora) {
  const rodada = chaveRodada(homePromotion);
  if (!rodada || estado?.rodada !== rodada) return [];
  return lista(estado).filter((hold) => hold
    && Number(hold.quantity) > 0
    && Number(hold.expiresAt || 0) > agora);
}

/** Unidades seguradas por pedidos ainda em aberto na rodada atual. */
export function quantidadeReservada(estado, homePromotion, agora = Date.now()) {
  const total = vigentes(estado, homePromotion, agora)
    .reduce((soma, hold) => soma + Math.floor(Number(hold.quantity || 0)), 0);
  return Math.max(0, total);
}

/**
 * Estado com a reserva do pedido adicionada, as vencidas podadas e as de outra
 * rodada descartadas. Regravar o mesmo `orderId` substitui a reserva anterior,
 * para retentativa de criação não somar duas vezes.
 *
 * Devolve o documento inteiro, não só a lista: `rodada` precisa ser regravada
 * junto, senão a poda por rodada não teria com o que comparar depois.
 */
export function comReservaPromo(estado, homePromotion, { orderId, quantity, paymentMethod }, agora = Date.now()) {
  const rodada = chaveRodada(homePromotion);
  const outras = vigentes(estado, homePromotion, agora).filter((hold) => hold.orderId !== orderId);
  const unidades = Math.max(0, Math.floor(Number(quantity || 0)));
  const holds = unidades === 0
    ? outras
    : [...outras, { orderId, quantity: unidades, expiresAt: agora + prazoReserva(paymentMethod) }];
  return { rodada, holds };
}

/**
 * Estado sem a reserva do pedido. Usado quando o pedido chega ao fim — pago (o
 * `soldCount` sobe na mesma transação e a reserva viraria contagem dobrada) ou
 * morto em `payment_review`.
 */
export function semReservaPromo(estado, homePromotion, orderId, agora = Date.now()) {
  const rodada = chaveRodada(homePromotion);
  return {
    rodada,
    holds: vigentes(estado, homePromotion, agora).filter((hold) => hold.orderId !== orderId),
  };
}
