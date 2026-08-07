/**
 * Reserva de pontos entre criar o pedido e confirmar o pagamento.
 *
 * O problema (MEDIO 2 do AUDITORIA.md): a checagem de saldo acontecia FORA de
 * transação, e o débito só no `fulfillOrder`. Dois checkouts simultâneos liam
 * o mesmo saldo, os dois passavam, os dois eram cobrados — e o segundo estourava
 * `insufficient_points` já com o cartão debitado.
 *
 * Duas decisões importantes:
 *
 * 1. **A reserva mora no documento do usuário**, não numa coleção à parte.
 *    Só assim o Firestore serializa: transações concorrentes que escrevem o
 *    MESMO documento entram em contenção e uma delas repete a leitura. Uma
 *    coleção `points_holds` separada não resolveria — cada transação criaria o
 *    seu doc sem enxergar o da outra, e o saldo continuaria furado.
 *
 * 2. **Toda reserva tem prazo.** Não existe endpoint de cancelamento de pedido
 *    no servidor: se a liberação dependesse só de cancelar, um pedido
 *    abandonado seguraria os pontos do cliente para sempre. Com prazo, o pior
 *    caso é o cliente esperar o prazo — e a falha volta a ser reversível.
 *    Reserva vencida é ignorada no cálculo e podada na escrita seguinte.
 */

// Cobre com folga um cartão (minutos) e um PIX (horas) sem deixar o saldo preso
// por mais de um dia quando o cliente desiste.
export const PRAZO_RESERVA_MS = 24 * 60 * 60 * 1000;

function lista(userData) {
  return Array.isArray(userData?.pointsHolds) ? userData.pointsHolds : [];
}

function vigentes(holds, agora) {
  return holds.filter((hold) => hold
    && Number(hold.points) > 0
    && Number(hold.expiresAt || 0) > agora);
}

/** Pontos reservados por pedidos ainda em aberto. */
export function pontosReservados(userData, agora = Date.now()) {
  return vigentes(lista(userData), agora)
    .reduce((soma, hold) => soma + Number(hold.points || 0), 0);
}

/** Saldo que o cliente pode realmente gastar agora. */
export function pontosDisponiveis(userData, agora = Date.now()) {
  const saldo = Math.max(0, Math.floor(Number(userData?.points || 0)));
  return Math.max(0, saldo - pontosReservados(userData, agora));
}

/**
 * Lista com a reserva do pedido adicionada e as vencidas podadas.
 * Regravar o mesmo `orderId` substitui a reserva anterior, para retentativa de
 * criação não somar duas vezes.
 */
export function comReserva(userData, orderId, points, agora = Date.now()) {
  const outras = vigentes(lista(userData), agora).filter((hold) => hold.orderId !== orderId);
  const quantidade = Math.max(0, Math.floor(Number(points || 0)));
  if (quantidade === 0) return outras;
  return [...outras, { orderId, points: quantidade, expiresAt: agora + PRAZO_RESERVA_MS }];
}

/**
 * Lista sem a reserva do pedido e sem as vencidas. Usada quando o pedido chega
 * ao fim — pago (os pontos viram débito de verdade) ou morto.
 */
export function semReserva(userData, orderId, agora = Date.now()) {
  return vigentes(lista(userData), agora).filter((hold) => hold.orderId !== orderId);
}
