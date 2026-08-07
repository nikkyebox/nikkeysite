import { HttpError } from './http.js';

const PAID_STATUSES = new Set(['confirmed', 'processing', 'shipped', 'delivered']);
const TOKYO_MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
});

export function activeByDate(value) {
  if (!value) return true;
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function paidOrder(order) {
  return order?.paymentConfirmed === true
    || order?.fulfillmentState === 'fulfilled'
    || PAID_STATUSES.has(String(order?.status || '').toLowerCase());
}

async function paidOrderCount(db, uid, email, requiredCount) {
  const limit = Math.max(1, Math.min(500, Math.floor(requiredCount) || 1));
  const queries = [];
  if (uid) queries.push(db.collection('orders').where('userId', '==', uid).limit(limit).get());
  if (email) queries.push(db.collection('orders').where('customerEmail', '==', email).limit(limit).get());
  if (queries.length === 0) return 0;

  const snapshots = await Promise.all(queries);
  const orders = new Map();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) orders.set(document.id, document.data());
  }
  let count = 0;
  for (const order of orders.values()) {
    if (paidOrder(order)) count += 1;
    if (count >= requiredCount) return count;
  }
  return count;
}

function birthMonth(value) {
  if (typeof value !== 'string') return 0;
  const match = /^(?:\d{4})-(\d{2})-(?:\d{2})(?:$|T)/.exec(value.trim());
  return match ? Number(match[1]) : 0;
}

/**
 * `emailVerified` separa e-mail PROVADO de e-mail DIGITADO.
 *
 * O checkout aceita convidado (`signInAnonymously`), e nesse caso o token não
 * tem e-mail nenhum: o endereço vem do formulário. Até 04/08/2026 os dois
 * casos eram tratados igual, então bastava digitar o endereço da vítima para
 * levar um cupom nominal dela — inclusive os 10/15/30% de recuperação de
 * carrinho, que `cart-recovery.js` emite como `targetType: 'specific'`.
 *
 * A mesma brecha valia para conta registrada com e-mail NÃO verificado: dava
 * para se cadastrar com o endereço de outra pessoa sem nunca abrir a caixa
 * dela. Por isso a checagem é `email_verified`, não "tem e-mail".
 *
 * O padrão é `false` de propósito: quem não passar o parâmetro falha fechado.
 */
export async function assertCouponEligibility(
  db,
  coupon,
  { uid = '', email = '', emailVerified = false, userDoc = null, productSubtotalYen = 0 } = {},
) {
  const targetType = String(coupon?.targetType || 'all');
  if (!['all', 'specific', 'birthday', 'loyalty'].includes(targetType)) {
    throw new HttpError(403, 'coupon_not_eligible');
  }

  // Cupom nominal: o endereço É a credencial. Sem prova de posse, não passa.
  if (targetType === 'specific') {
    const targets = Array.isArray(coupon.targetEmails)
      ? coupon.targetEmails.map((entry) => String(entry).trim().toLowerCase())
      : [];
    if (!emailVerified || !email || !targets.includes(email)) throw new HttpError(403, 'coupon_not_eligible');
  }

  // `birthday` já falhava fechado para convidado: depende de `userDoc`, que é
  // buscado por uid e não existe para conta anônima.
  if (targetType === 'birthday') {
    const currentMonth = Number(TOKYO_MONTH_FORMAT.format(new Date()));
    if (!userDoc || birthMonth(userDoc.birthdate) !== currentMonth) {
      throw new HttpError(403, 'coupon_not_eligible');
    }
  }

  // O histórico do `uid` é sempre confiável — veio do login. O do e-mail, só
  // quando verificado; senão bastaria digitar o endereço de um cliente antigo
  // para herdar a fidelidade dele.
  if (targetType === 'loyalty') {
    const requiredCount = Math.max(1, Math.min(500, Math.floor(Number(coupon.minOrders || 1))));
    const emailConfiavel = emailVerified ? email : '';
    if ((await paidOrderCount(db, uid, emailConfiavel, requiredCount)) < requiredCount) {
      throw new HttpError(403, 'coupon_not_eligible');
    }
  }

  const minimum = Math.max(0, Number(coupon?.minOrderValue || 0));
  const subtotal = Math.max(0, Number(productSubtotalYen || 0));
  if (minimum > 0 && subtotal > 0 && subtotal < minimum) {
    throw new HttpError(409, 'coupon_minimum_not_met');
  }
}
