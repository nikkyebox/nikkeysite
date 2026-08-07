import { adminDb } from './firebase-admin.js';

/**
 * Verifica se o cliente está bloqueado de receber o e-mail de 30%.
 *
 * Quem recebeu o cupom de 30% E o usou na compra fica com teto de 15% —
 * `blockedFrom30 === true` nesse caso. Libera-se apenas ao comprar com
 * desconto < 15% (exatamente 15% mantém bloqueado).
 *
 * Se o perfil do cliente ainda não existe, retorna `false` (liberado).
 * Erro de leitura retorna `true`: numa indisponibilidade é mais seguro segurar
 * o desconto máximo do que furar a trava antiabuso.
 */
export async function isBlockedFrom30(uid) {
  if (!uid) return false;
  try {
    const snap = await adminDb().collection('cart_recovery_profiles').doc(uid).get();
    return snap.data()?.blockedFrom30 === true;
  } catch {
    return true;
  }
}

/**
 * Registra a compra de um cliente, atualizando o perfil de bloqueio de 30%.
 *
 * Regra de bloqueio:
 * - `discountPercent >= 30` → bloqueia de 30% (`blockedFrom30: true`).
 * - `discountPercent < 15` → libera de 30% (`blockedFrom30: false`).
 * - `15 <= discountPercent < 30` → preserva o estado atual (omite a chave com
 *   `merge: true`), porque comprar com 15% é exatamente o teto que a trava
 *   impõe. Usar esse desconto não prova que o cliente parou de esperar o 30%
 *   — prova apenas que está bloqueado e agindo conforme esperado.
 *
 * `purchaseDiscountProfileUpdate` também é usado dentro da transação de
 * fulfillment, para confirmação da compra e trava antiabuso serem atômicas.
 */
export function purchaseDiscountProfileUpdate(discountPercent, now = new Date()) {
  const pct = Number.isFinite(discountPercent) ? Number(discountPercent) : 0;
  const update = {
    lastDiscountPercent: pct,
    updatedAt: now.toISOString(),
  };
  if (pct >= 30) {
    update.blockedFrom30 = true;
  } else if (pct < 15) {
    update.blockedFrom30 = false;
  }
  return update;
}

export async function recordPurchaseDiscount(uid, discountPercent) {
  if (!uid) return;
  try {
    await adminDb().collection('cart_recovery_profiles').doc(uid).set(
      purchaseDiscountProfileUpdate(discountPercent),
      { merge: true },
    );
  } catch {
    // Falha não aborta o fluxo — quem chama deve poder ignorar erro.
  }
}
