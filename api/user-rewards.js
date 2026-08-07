import { createHash } from 'node:crypto';
import { requireUser } from './_lib/auth.js';
import { adminAuth, adminDb } from './_lib/firebase-admin.js';
import {
  assertExactKeys,
  handleCors,
  HttpError,
  parseJsonObject,
  requiredText,
  sendError,
} from './_lib/http.js';
import { isPaidLoyaltyOrder } from '../shared/points.js';

const SOCIAL_POINTS = 500;
const BIRTHDAY_POINTS = 1000;
const REVIEW_POINTS = 1;
const SOCIAL_NETWORKS = new Set(['instagram', 'facebook', 'tiktok', 'x']);
const PAID_STATUSES = new Set(['confirmed', 'processing', 'shipped', 'delivered']);
// Impede exploração: conta recém-criada não pode apontar `birthdate` para hoje e
// sacar 1.000 pontos na hora, repetindo por conta nova. O `creationTime` do
// Firebase Auth é carimbado pelo servidor, logo não-forjável; o campo do
// documento não serve, porque quem escreve é o cliente.
//
// A trava tem uma saída, e ela não é frouxa: quem já pagou um pedido recebe na
// hora (ver `claimBirthday`). Sem essa saída, quem se cadastra NO dia do próprio
// aniversário — que é justamente quem se cadastrou por causa do brinde — leva um
// "indisponível" e só ganha no ano seguinte. Com ela, a fraude fica sem conta:
// ninguém compra de verdade para levar ¥1.000 de desconto.
const IDADE_MINIMA_CONTA_DIAS = 30;
const TOKYO_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

function currentPoints(data) {
  const value = Number(data?.points || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function result(awarded, total, alreadyClaimed = false) {
  return { ok: true, awarded, total, alreadyClaimed };
}

function tokenEmail(user) {
  return typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
}

function birthMonthDay(value) {
  if (typeof value !== 'string') return null;
  const match = /^(?:\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return { month, day };
}

function tokyoDateParts(date = new Date()) {
  const values = Object.fromEntries(
    TOKYO_DATE_FORMAT.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

async function claimSocialFollow(db, user, body) {
  assertExactKeys(body, ['action', 'network']);
  const network = requiredText(body.network, { max: 20 });
  if (!SOCIAL_NETWORKS.has(network)) throw new HttpError(400, 'invalid_network');

  const userRef = db.collection('users').doc(user.uid);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) throw new HttpError(404, 'user_not_found');

    const data = snapshot.data() || {};
    const points = currentPoints(data);
    const follows = data.socialFollows && typeof data.socialFollows === 'object'
      ? data.socialFollows
      : {};
    if (follows[network] === true) return result(0, points, true);

    const total = points + SOCIAL_POINTS;
    transaction.update(userRef, {
      socialFollows: { ...follows, [network]: true },
      points: total,
      updatedAt: new Date().toISOString(),
    });
    return result(SOCIAL_POINTS, total);
  });
}

async function claimBirthday(db, user, body) {
  assertExactKeys(body, ['action']);

  // A data de criação vem do Firebase Auth, não do documento: o cliente escreve
  // o documento, e um campo que ele controla não serve de trava. Sem esta
  // idade mínima bastava criar conta, apontar `birthdate` para hoje e sacar os
  // 1.000 pontos na hora — repetindo por conta nova.
  //
  // Data ilegível recusa em vez de liberar: um `NaN` numa comparação de
  // "menor que" passaria batido, e a trava viraria enfeite.
  const contaCriadaEm = new Date((await adminAuth().getUser(user.uid))?.metadata?.creationTime ?? NaN).getTime();
  const idadeEmDias = (Date.now() - contaCriadaEm) / 86_400_000;
  if (!Number.isFinite(idadeEmDias)) throw new HttpError(409, 'birthday_unavailable');
  // Conta nova só passa com compra paga. É o que separa o cliente que se
  // cadastrou NO dia do próprio aniversário — e perderia o brinde que o trouxe
  // até aqui — de quem abre conta descartável para sacar ¥1.000: os dois olham
  // igual no cadastro, e só a compra distingue. Fraudar passa a exigir um
  // pedido pago de verdade, que custa mais do que o prêmio.
  //
  // A consulta de pedidos só roda para conta nova; cliente antigo nem paga esse
  // custo.
  if (idadeEmDias < IDADE_MINIMA_CONTA_DIAS && !(await temCompraPaga(db, user))) {
    throw new HttpError(409, 'birthday_unavailable');
  }

  const userRef = db.collection('users').doc(user.uid);
  const { year, month, day } = tokyoDateParts();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) throw new HttpError(404, 'user_not_found');

    const data = snapshot.data() || {};
    const points = currentPoints(data);
    const birthday = birthMonthDay(data.birthdate);
    if (!birthday || birthday.month !== month || birthday.day !== day) {
      throw new HttpError(409, 'birthday_unavailable');
    }
    if (Number(data.birthdayBonusYear || 0) === year) return result(0, points, true);

    const total = points + BIRTHDAY_POINTS;
    transaction.update(userRef, {
      birthdayBonusYear: year,
      points: total,
      updatedAt: new Date().toISOString(),
    });
    return result(BIRTHDAY_POINTS, total);
  });
}

function orderContainsProduct(order, productId) {
  if (!order || typeof order !== 'object') return false;
  const paid = order.paymentConfirmed === true
    || order.fulfillmentState === 'fulfilled'
    || PAID_STATUSES.has(String(order.status || '').toLowerCase());
  if (!paid || !Array.isArray(order.items)) return false;
  return order.items.some((item) => {
    if (!item || typeof item !== 'object') return false;
    return String(item.productId || item.id || '') === productId;
  });
}

/**
 * Pedidos do cliente, por conta e por e-mail. Os dois caminhos existem porque
 * um pedido feito como convidado fica preso ao e-mail, sem `userId` da conta
 * que ele criou depois.
 */
async function pedidosDoCliente(db, user) {
  const queries = [
    db.collection('orders').where('userId', '==', user.uid).limit(200).get(),
  ];
  const email = tokenEmail(user);
  if (email) {
    queries.push(
      db.collection('orders').where('customerEmail', '==', email).limit(200).get(),
    );
  }

  const snapshots = await Promise.all(queries);
  const orders = new Map();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) orders.set(document.id, document.data());
  }
  return [...orders.values()];
}

/** Cliente de verdade: pelo menos um pedido com pagamento confirmado. */
async function temCompraPaga(db, user) {
  return (await pedidosDoCliente(db, user)).some(isPaidLoyaltyOrder);
}

async function hasPurchasedProduct(db, user, productId) {
  return (await pedidosDoCliente(db, user)).some((order) => orderContainsProduct(order, productId));
}

async function claimProductReview(db, user, body) {
  assertExactKeys(body, ['action', 'productId']);
  const productId = requiredText(body.productId, { max: 160 });
  if (!(await hasPurchasedProduct(db, user, productId))) {
    throw new HttpError(403, 'verified_purchase_required');
  }

  const claimId = createHash('sha256')
    .update(`${user.uid}\0${productId}`)
    .digest('hex');
  const claimRef = db.collection('point_reward_claims').doc(`review-${claimId}`);
  const userRef = db.collection('users').doc(user.uid);

  return db.runTransaction(async (transaction) => {
    const [claimSnapshot, userSnapshot] = await Promise.all([
      transaction.get(claimRef),
      transaction.get(userRef),
    ]);
    if (!userSnapshot.exists) throw new HttpError(404, 'user_not_found');

    const points = currentPoints(userSnapshot.data());
    if (claimSnapshot.exists) return result(0, points, true);

    const total = points + REVIEW_POINTS;
    transaction.create(claimRef, {
      type: 'product_review',
      userId: user.uid,
      productId,
      points: REVIEW_POINTS,
      createdAt: new Date().toISOString(),
    });
    transaction.update(userRef, {
      points: total,
      updatedAt: new Date().toISOString(),
    });
    return result(REVIEW_POINTS, total);
  });
}

export default async function handler(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;

  try {
    const user = await requireUser(req);
    const body = parseJsonObject(req.body);
    const action = requiredText(body.action, { max: 30 });
    const db = adminDb();

    if (action === 'social-follow') {
      res.status(200).json(await claimSocialFollow(db, user, body));
      return;
    }
    if (action === 'birthday') {
      res.status(200).json(await claimBirthday(db, user, body));
      return;
    }
    if (action === 'product-review') {
      res.status(200).json(await claimProductReview(db, user, body));
      return;
    }
    throw new HttpError(400, 'invalid_action');
  } catch (error) {
    console.error('[user-rewards]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

export { claimBirthday, claimProductReview, claimSocialFollow };
