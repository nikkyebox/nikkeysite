/**
 * Reserva de estoque entre criar o pedido e confirmar o pagamento.
 *
 * Mesmo defeito do `points-hold.js` (MEDIO 2 do AUDITORIA.md), mas em
 * mercadoria: a checagem de estoque em `orders.js` (`handleCreate`) roda FORA
 * de transação, em cima de uma leitura feita minutos antes. Dois checkouts
 * simultâneos do MESMO produto liam o mesmo `stock.quantity`, os dois
 * passavam, os dois eram cobrados no Stripe — e só na baixa real
 * (`fulfillment.js`, na confirmação de pagamento) um deles estourava
 * `insufficient_stock`, com o cartão do cliente já debitado.
 *
 * Mesma solução: a reserva mora no próprio documento do produto (não numa
 * coleção à parte), porque só assim o Firestore serializa — duas transações
 * escrevendo o MESMO doc entram em contenção e uma repete a leitura. E toda
 * reserva tem prazo: sem cancelamento de pedido no servidor, um checkout
 * abandonado prenderia a unidade para sempre.
 */

// Mesmo teto que `points-hold.js` já escolheu: cobre um cartão (minutos) e um
// PIX (horas) sem segurar a unidade por mais de um dia quando o cliente desiste.
export const PRAZO_RESERVA_MS = 24 * 60 * 60 * 1000;

function lista(productData) {
  return Array.isArray(productData?.stockHolds) ? productData.stockHolds : [];
}

function vigentes(holds, agora) {
  return holds.filter((hold) => hold
    && Number(hold.quantity) > 0
    && Number(hold.expiresAt || 0) > agora);
}

/** Unidades reservadas por OUTROS pedidos ainda em aberto (exclui `orderId`, para retentativa do mesmo pedido não competir consigo mesma). */
export function estoqueReservado(productData, orderId, agora = Date.now()) {
  return vigentes(lista(productData), agora)
    .filter((hold) => hold.orderId !== orderId)
    .reduce((soma, hold) => soma + Number(hold.quantity || 0), 0);
}

/** Unidades que este pedido pode realmente reservar agora. */
export function estoqueDisponivel(productData, orderId, agora = Date.now()) {
  const total = Math.max(0, Math.floor(Number(productData?.stock?.quantity || 0)));
  return Math.max(0, total - estoqueReservado(productData, orderId, agora));
}

/**
 * Lista com a reserva do pedido adicionada e as vencidas podadas.
 * Regravar o mesmo `orderId` substitui a reserva anterior, para retentativa de
 * criação não somar duas vezes.
 */
export function comReservaEstoque(productData, orderId, quantity, agora = Date.now()) {
  const outras = vigentes(lista(productData), agora).filter((hold) => hold.orderId !== orderId);
  const quantidade = Math.max(0, Math.floor(Number(quantity || 0)));
  if (quantidade === 0) return outras;
  return [...outras, { orderId, quantity: quantidade, expiresAt: agora + PRAZO_RESERVA_MS }];
}

/**
 * Lista sem a reserva do pedido e sem as vencidas. Usada quando o pedido chega
 * ao fim — pago (a unidade vira baixa de verdade em `stock.quantity`) ou morto
 * (recusado na baixa, foi para revisão).
 */
export function semReservaEstoque(productData, orderId, agora = Date.now()) {
  return vigentes(lista(productData), agora).filter((hold) => hold.orderId !== orderId);
}
