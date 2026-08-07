import { createHmac, randomUUID } from 'node:crypto';
import { requireCronSecret } from './_lib/auth.js';
import { isBlockedFrom30 } from './_lib/cart-recovery-profile.js';
import { isOptedOut } from './_lib/email-optout.js';
import { adminAuth, adminDb } from './_lib/firebase-admin.js';
import { escapeHtml, handleCors, sendError } from './_lib/http.js';
import { sendMail, siteOrigin, unsubscribeUrl, wrapEmail } from './_lib/mailer.js';

const CLAIM_TTL_MS = 10 * 60 * 1000;
const DISCOUNT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

// O cron diário envia 10% → 15% → 30%, sempre com três dias reais entre
// descontos. Se o cron ficar fora do ar, ele não tenta recuperar tudo em dias
// consecutivos. Depois do estágio 3 o documento sai da fila e nenhum outro
// e-mail é enviado.
//
// Quem já comprou usando 30% fica impedido de receber outro cupom de 30% até
// concluir uma compra com desconto abaixo de 15% (ver o perfil de recuperação).
const STAGES = [
  { stage: 1, thresholdMs: 3 * 24 * 60 * 60 * 1000, discount: 10, validadeMs: 48 * 60 * 60 * 1000 },
  { stage: 2, thresholdMs: 6 * 24 * 60 * 60 * 1000, discount: 15, validadeMs: 48 * 60 * 60 * 1000 },
  { stage: 3, thresholdMs: 9 * 24 * 60 * 60 * 1000, discount: 30, validadeMs: 24 * 60 * 60 * 1000 },
];

/**
 * Cada abandono recebe um código próprio. Um código global estendia a validade
 * para todos os destinatários sempre que um novo e-mail saía e fazia a lista
 * `targetEmails` crescer sem limite.
 */
function recoveryCouponCode(uid, abandonedAt, discount) {
  const key = process.env.CART_RECOVERY_SECRET
    || process.env.UNSUBSCRIBE_SECRET
    || process.env.CRON_SECRET;
  if (!key) throw new Error('cart_recovery_secret_not_configured');
  const suffix = createHmac('sha256', key)
    .update(`${uid}:${abandonedAt}:${discount}`)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();
  return `CARRINHO${discount}-${suffix}`;
}

async function garantirCupom(uid, email, abandonedAt, discount, validadeMs) {
  const code = recoveryCouponCode(uid, abandonedAt, discount);
  const ref = adminDb().collection('coupons').doc(code);
  const atual = (await ref.get()).data();
  const expiraEm = Date.now() + validadeMs;

  await ref.set({
    code,
    type: 'percent',
    discount: 0,               // legado: o valor real fica em discountPercent
    discountPercent: discount,
    description: `Recuperacao de carrinho — ${discount}% OFF no pedido`,
    // Como o documento é individual, renovar este prazo nunca reabre o cupom
    // de outra pessoa.
    expiryDate: new Date(expiraEm).toISOString(),
    isActive: true,
    targetType: 'specific',
    targetEmails: [email],
    updatedAt: new Date().toISOString(),
    ...(atual ? {} : { usedCount: 0, createdAt: new Date().toISOString() }),
  }, { merge: true });

  return { code, horas: Math.round(validadeMs / 3600000) };
}

function buildRecoveryEmail(stageDef, name, items, cupom, unsub) {
  const rows = Array.isArray(items)
    ? items.slice(0, 5).map((item) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(item.name)}${Number(item.quantity) > 1 ? ` (${Math.floor(Number(item.quantity))}x)` : ''}</td></tr>`).join('')
    : '';
  const greeting = `<p>Ola${name ? `, <strong>${escapeHtml(name)}</strong>` : ''}.</p><p>Seu carrinho ainda esta esperando:</p><table style="width:100%">${rows}</table>`;
  const cta = `<p style="text-align:center"><a href="${siteOrigin()}/carrinho" style="display:inline-block;background:#a855f7;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:bold">Voltar ao carrinho</a></p>`;


  const ultimo = stageDef.stage === STAGES.length;
  const aviso = ultimo
    ? `<p style="margin:6px 0 0;font-size:13px">Esta e a nossa ultima oferta para este carrinho.</p>`
    : '';
  const discountBlock = `<div style="margin:20px 0;padding:18px;border:2px dashed #a855f7;border-radius:12px;text-align:center"><p style="margin:0">Seu cupom exclusivo</p><p style="font-size:26px;font-weight:900;color:#a855f7;margin:8px 0">${escapeHtml(cupom.code)}</p><p style="margin:0"><strong>${stageDef.discount}% de desconto</strong> se voce finalizar nas proximas <strong>${cupom.horas} horas</strong>.</p><p style="margin:6px 0 0;font-size:13px">So funciona nesta conta e vale para um pedido.</p>${aviso}</div>`;
  return {
    subject: ultimo
      ? `Ultima chance: ${stageDef.discount}% OFF por ${cupom.horas}h - NikkeyBox`
      : `Finalize e ganhe ${stageDef.discount}% OFF - NikkeyBox`,
    html: wrapEmail(`${greeting}${discountBlock}${cta}`, { unsubscribeUrl: unsub }),
  };
}

/** Estágio devido agora, incluindo três dias desde o último desconto enviado. */
function dueStage(data) {
  const current = Math.max(0, Math.floor(Number(data.reminderStage) || 0));
  if (current >= STAGES.length) return null;
  const next = STAGES[current];
  if (!next) return null;
  const abandonedAt = Number(data.abandonedAt) || 0;
  const now = Date.now();
  if (!abandonedAt || now - abandonedAt < next.thresholdMs) return null;
  if (current >= 1) {
    // Documentos antigos podem não ter `reminderSentAt`; o threshold esperado
    // do estágio anterior é o fallback seguro para que não fiquem presos.
    const previousSentAt = Number(data.reminderSentAt)
      || abandonedAt + STAGES[current - 1].thresholdMs;
    if (now - previousSentAt < DISCOUNT_INTERVAL_MS) return null;
  }
  return next;
}

/**
 * Trava o documento (transação idempotente) e retorna o estágio devido + dados
 * do carrinho, ou `null` se nada está devido agora ou se já há uma tentativa em
 * andamento (`reminderClaimedAt` recente) de outra execução concorrente.
 */
async function claimCart(document, claimId) {
  const db = adminDb();
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(document.ref);
    const data = snap.data() || {};
    const claimedAt = Number(data.reminderClaimedAt || 0);
    if (claimedAt && Date.now() - claimedAt < CLAIM_TTL_MS) return null;
    const stageDef = dueStage(data);
    if (!stageDef) return null;
    transaction.update(document.ref, { reminderClaimId: claimId, reminderClaimedAt: Date.now() });
    return { data, stageDef };
  });
}
async function dueDocuments(db) {
  const carts = db.collection('abandoned_carts');
  // Só igualdade: índices automáticos bastam. A decisão de tempo continua em
  // `dueStage`, dentro da transação, evitando depender de índice composto novo
  // para que a campanha funcione em produção.
  const snapshots = await Promise.all([
    ...STAGES.map((_, stage) => carts.where('reminderStage', '==', stage).limit(500).get()),
    // Compatibilidade com snapshots gravados antes de `reminderStage: 0`.
    carts.where('reminderSent', '==', false).limit(500).get(),
  ]);
  return [...new Map(
    snapshots.flatMap((snapshot) => snapshot.docs).map((document) => [document.id, document]),
  ).values()];
}


export default async function handler(req, res) {
  if (!handleCors(req, res, { methods: ['GET', 'POST'] })) return;

  try {
    requireCronSecret(req);
    const db = adminDb();
    const documents = await dueDocuments(db);

    let sent = 0;
    let skipped = 0;
    for (const document of documents) {
      const claimId = randomUUID();
      const claimed = await claimCart(document, claimId);
      if (!claimed) {
        skipped += 1;
        continue;
      }
      const { data, stageDef } = claimed;
      try {
        const user = await adminAuth().getUser(document.id);
        if (!user.email) throw new Error('missing_email');
        // Quem cancelou a inscricao sai da fila de vez: `reminderStage` no topo
        // tira o carrinho do filtro da consulta. Sem isso o cron reavaliaria o
        // mesmo documento todo dia so para decidir de novo nao enviar nada.
        if (await isOptedOut(user.email)) {
          await document.ref.update({
            reminderStage: STAGES.length,
            reminderOptedOut: true,
            reminderClaimId: null,
            reminderClaimedAt: null,
          });
          skipped += 1;
          continue;
        }
        // Quem comprou usando o cupom de 30% fica com teto de 15% para evitar
        // que aprenda a abandonar carrinho de propósito esperando o desconto máximo.
        // Se estiver bloqueado e o estágio devido é 30%, encerra com `reminderCapped30`
        // marcado para auditoria. Fora disso o carrinho segue normal.
        if (stageDef.discount === 30 && await isBlockedFrom30(document.id)) {
          await document.ref.update({
            reminderStage: STAGES.length,
            reminderCapped30: true,
            reminderClaimId: null,
            reminderClaimedAt: null,
          });
          skipped += 1;
          continue;
        }
        // O cupom nasce antes do envio: se a criação falhar, o e-mail não sai
        // prometendo um código inexistente — o carrinho fica para o próximo cron.
        const cupom = await garantirCupom(
          document.id,
          user.email,
          data.abandonedAt,
          stageDef.discount,
          stageDef.validadeMs,
        );
        const unsub = unsubscribeUrl(user.email);
        await sendMail({
          to: user.email,
          ...buildRecoveryEmail(stageDef, user.displayName || '', data.items, cupom, unsub),
          unsubscribe: unsub,
        });
        await document.ref.update({
          reminderStage: stageDef.stage,
          reminderSent: true,
          reminderSentAt: Date.now(),
          reminderClaimId: null,
          reminderClaimedAt: null,
        });
        sent += 1;
      } catch {
        await document.ref.update({ reminderClaimId: null, reminderClaimedAt: null }).catch(() => undefined);
        skipped += 1;
      }
    }

    res.status(200).json({ ok: true, sent, skipped, processed: documents.length });
  } catch (error) {
    console.error('[cart-recovery]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}
