import { FieldValue } from 'firebase-admin/firestore';
import { purchaseDiscountProfileUpdate } from './cart-recovery-profile.js';
import { adminDb } from './firebase-admin.js';
import { HttpError } from './http.js';
import { buildPaymentReviewEmail, sendMail } from './mailer.js';
import { semReserva } from './points-hold.js';
import { indiceDePessoaId, promoUsageId } from './promo-identity.js';
import { refEstadoPromo, semReservaPromo } from './promo-reserve.js';

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function eventId(provider, reference) {
  return `${provider}:${reference}`.replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 300);
}

/**
 * Extrai o percentual de desconto efetivo do pedido.
 *
 * Tenta primeiro calcular a partir de `couponDiscountYen` dividido pelo subtotal
 * de mercadoria (itens que não são brinde ou promoção); se não houver base de
 * cálculo finita/positiva, tenta extrair o número de um código tipo `CARRINHO<n>`
 * (ex: `CARRINHO15` → 15); sem nada disso, retorna 0 (sem desconto).
 */
function extractDiscountPercent(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const regularSubtotal = items
    .filter((item) => !item.homePromo && !item.freeGift)
    .reduce((sum, item) => sum + Number(item.unitYen || 0) * Number(item.quantity || 0), 0);

  if (Number.isFinite(regularSubtotal) && regularSubtotal > 0 && Number.isFinite(order.couponDiscountYen)) {
    const pct = Math.round(Number(order.couponDiscountYen) / regularSubtotal * 100);
    if (Number.isFinite(pct) && pct >= 0) return pct;
  }

  // Fallback: tenta extrair o número do código `CARRINHO<n>`
  if (typeof order.couponCode === 'string') {
    const match = order.couponCode.match(/^CARRINHO(\d{1,2})(?:-[A-Z0-9]+)?$/i);
    if (match) {
      const extracted = Number(match[1]);
      if (Number.isFinite(extracted)) return extracted;
    }
  }

  return 0;
}

export async function fulfillOrder(orderId, { provider, reference, confirmedBy }) {
  const db = adminDb();
  const orderRef = db.collection('orders').doc(orderId);

  const result = await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) throw new HttpError(404, 'order_not_found');
    const order = orderSnap.data();
    if (order.fulfillmentState === 'fulfilled') return { replay: true, order };
    if (order.status === 'cancelled') throw new HttpError(409, 'order_cancelled');
    if (provider === 'stripe' && order.stripePaymentIntentId !== reference) throw new HttpError(409, 'payment_reference_mismatch');

    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) throw new HttpError(409, 'order_has_no_items');
    const quantities = new Map();
    for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) || 0) + Number(item.quantity || 0));

    const productRefs = [...quantities.keys()].map((productId) => db.collection('products').doc(productId));
    const eventRef = db.collection('fulfillment_events').doc(eventId(provider, reference));
    const userRef = db.collection('users').doc(order.userId);
    const homePromoRef = db.collection('siteContent').doc('homePromotion');
    const promoStateRef = order.homePromoQuantity ? refEstadoPromo(db) : null;
    // Sem CPF (cliente fora do Brasil) a âncora vira o uid — antes o limite
    // de promoção simplesmente não existia para esse cliente.
    const pessoa = { cpf: order.cpf, userId: order.userId };
    const pessoaId = indiceDePessoaId(pessoa);
    const usoPromoId = promoUsageId(order.promoCode, pessoa);
    const cpfRef = pessoaId ? db.collection('cpf_index').doc(pessoaId) : null;
    const promoUsageRef = usoPromoId ? db.collection('promo_usage').doc(usoPromoId) : null;
    const couponRef = order.couponSource === 'global' && order.couponCode ? db.collection('coupons').doc(order.couponCode) : null;
    const couponUsageRef = order.couponSource === 'global' && order.couponCode ? db.collection('coupon_usage').doc(order.couponCode) : null;
    const affiliateRef = order.affiliateCode ? db.collection('affiliates').doc(order.affiliateCode) : null;
    const pendingCommissionRef = order.affiliateCode ? db.collection('affiliate_pending').doc(`${order.affiliateCode}-${orderId}`) : null;
    const negotiationRef = order.negotiationId ? db.collection('negotiations').doc(order.negotiationId) : null;
    const recoveryProfileRef = order.userId ? db.collection('cart_recovery_profiles').doc(order.userId) : null;

    const refs = [
      ...productRefs,
      eventRef,
      userRef,
      ...(order.homePromoQuantity ? [homePromoRef] : []),
      ...(promoStateRef ? [promoStateRef] : []),
      ...(cpfRef ? [cpfRef] : []),
      ...(promoUsageRef ? [promoUsageRef] : []),
      ...(couponRef ? [couponRef] : []),
      ...(couponUsageRef ? [couponUsageRef] : []),
      ...(affiliateRef ? [affiliateRef] : []),
      ...(pendingCommissionRef ? [pendingCommissionRef] : []),
      ...(negotiationRef ? [negotiationRef] : []),
    ];
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const byPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
    const eventSnap = byPath.get(eventRef.path);
    if (eventSnap.exists) {
      if (eventSnap.data()?.orderId === orderId) return { replay: true, order };
      throw new HttpError(409, 'payment_reference_reused');
    }

    for (const ref of productRefs) {
      const productSnap = byPath.get(ref.path);
      if (!productSnap.exists) throw new HttpError(409, 'product_unavailable');
      const product = productSnap.data();
      const quantity = quantities.get(ref.id);
      if (product.stock?.unlimited === false && Number(product.stock.quantity || 0) < quantity) {
        throw new HttpError(409, 'insufficient_stock');
      }
    }

    const cpfSnap = cpfRef ? byPath.get(cpfRef.path) : null;
    const cpfData = cpfSnap?.exists ? cpfSnap.data() : { productIds: [], affiliateCodes: [] };
    const limitedProducts = items.filter((item) => item.homePromo).map((item) => item.productId);
    if (limitedProducts.some((productId) => cpfData.productIds?.includes(productId))) throw new HttpError(409, 'promotion_limit');
    if (order.affiliateCode && !order.affiliateProductId && cpfData.affiliateCodes?.length) throw new HttpError(409, 'affiliate_coupon_already_used');
    if (promoUsageRef && byPath.get(promoUsageRef.path).exists) throw new HttpError(409, 'promotion_already_used');

    let nextHomePromo = null;
    if (order.homePromoQuantity) {
      const homeSnap = byPath.get(homePromoRef.path);
      if (!homeSnap.exists) throw new HttpError(409, 'promotion_unavailable');
      const home = homeSnap.data();
      const homeProduct = items.find((item) => item.homePromo)?.productId;
      if (home.productId !== homeProduct) throw new HttpError(409, 'promotion_changed');
      const soldCount = Number(home.soldCount || 0) + Number(order.homePromoQuantity || 0);
      if (home.maxProducts != null && soldCount > Number(home.maxProducts)) throw new HttpError(409, 'promotion_unavailable');
      if (home.maxProducts != null && soldCount >= Number(home.maxProducts) && home.nextPromo) {
        const scheduled = home.nextPromo;
        nextHomePromo = {
          ...scheduled,
          expiresAt: scheduled.durationDays ? Date.now() + Number(scheduled.durationDays) * 86400000 : null,
          soldCount: 0,
          nextPromo: null,
        };
      } else {
        nextHomePromo = { ...home, soldCount };
      }
    }

    const userSnap = byPath.get(userRef.path);
    const registeredUser = userSnap.exists && order.customerType !== 'guest';
    const userData = userSnap.exists ? userSnap.data() : null;
    const currentPoints = Number(userData?.points || 0);
    if (Number(order.redeemPoints || 0) > currentPoints) throw new HttpError(409, 'insufficient_points');

    const couponSnap = couponRef ? byPath.get(couponRef.path) : null;
    const couponUsageSnap = couponUsageRef ? byPath.get(couponUsageRef.path) : null;
    if (couponSnap) {
      if (!couponSnap.exists) throw new HttpError(409, 'coupon_unavailable');
      const coupon = couponSnap.data();
      if (coupon.isActive === false || (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit))) throw new HttpError(409, 'coupon_unavailable');
      // O guarda "1× por cliente" era ancorado só em e-mail, que o convidado
      // troca de graça. Para o Brasil o CPF agora é obrigatório (`orders.js`
      // `parseCustomer`) e é ele que tranca — documento não se cria à vontade.
      // O e-mail continua valendo em paralelo: fora do Brasil não há CPF, e os
      // usos já gravados são todos por e-mail. Recusar em qualquer um dos dois
      // é o que fecha o buraco sem invalidar o histórico.
      const uso = couponUsageSnap.data() || {};
      const usedBy = Array.isArray(uso.usedBy) ? uso.usedBy : [];
      const usedByCpf = Array.isArray(uso.usedByCpf) ? uso.usedByCpf : [];
      const cpfDoPedido = String(order.cpf || '').replace(/\D/g, '');
      if (usedBy.map((email) => String(email).toLowerCase()).includes(String(order.customerEmail).toLowerCase())) throw new HttpError(409, 'coupon_already_used');
      if (cpfDoPedido.length === 11 && usedByCpf.includes(cpfDoPedido)) throw new HttpError(409, 'coupon_already_used');
    }

    const affiliateSnap = affiliateRef ? byPath.get(affiliateRef.path) : null;
    if (affiliateRef && (!affiliateSnap.exists || affiliateSnap.data()?.active === false)) throw new HttpError(409, 'affiliate_unavailable');

    for (const ref of productRefs) {
      const product = byPath.get(ref.path).data();
      const quantity = quantities.get(ref.id);
      const update = { salesCount: Number(product.salesCount || 0) + quantity };
      if (product.stock?.unlimited === false) update['stock.quantity'] = Number(product.stock.quantity || 0) - quantity;
      transaction.update(ref, update);
    }
    transaction.create(eventRef, { orderId, provider, reference, createdAt: new Date().toISOString() });

    if (nextHomePromo) transaction.set(homePromoRef, nextHomePromo);
    if (promoStateRef) {
      const promoStateSnap = byPath.get(promoStateRef.path);
      const homePromoSnap = byPath.get(homePromoRef.path);
      const promoStateAgora = promoStateSnap?.exists ? promoStateSnap.data() : null;
      const homePromoAgora = homePromoSnap?.exists ? homePromoSnap.data() : null;
      // Pedido pago: remover a reserva (vendido já foi somado acima no nextHomePromo).
      // Se um checkout simultâneo estiver criando o pedido, ele vai ver o estado
      // atual sem a unidade, e a recusa 409 acontece na transação, não no checkout.
      const promoEstadoSemReserva = semReservaPromo(promoStateAgora, homePromoAgora, orderId);
      transaction.set(promoStateRef, promoEstadoSemReserva);
    }
    if (cpfRef) {
      transaction.set(cpfRef, {
        productIds: unique([...(cpfData.productIds || []), ...limitedProducts]),
        affiliateCodes: unique([...(cpfData.affiliateCodes || []), ...(order.affiliateCode && !order.affiliateProductId ? [order.affiliateCode] : [])]),
      }, { merge: true });
    }
    if (promoUsageRef) {
      transaction.create(promoUsageRef, {
        code: order.promoCode,
        cpf: order.cpf || '',
        // Guarda qual âncora trancou o uso, para auditoria: nem todo registro
        // tem CPF desde que o limite passou a valer também por conta.
        pessoaId,
        email: order.customerEmail,
        orderId,
        usedAt: Date.now(),
      });
    }
    if (couponRef) transaction.update(couponRef, { usedCount: Number(couponSnap.data().usedCount || 0) + 1 });
    if (couponUsageRef) {
      const uso = couponUsageSnap.data() || {};
      const usedBy = Array.isArray(uso.usedBy) ? uso.usedBy : [];
      const usedByCpf = Array.isArray(uso.usedByCpf) ? uso.usedByCpf : [];
      const cpfDoPedido = String(order.cpf || '').replace(/\D/g, '');
      transaction.set(couponUsageRef, {
        usedBy: unique([...usedBy, order.customerEmail]),
        // Só entra CPF válido: uma lista com `''` casaria com todo pedido sem
        // documento e trancaria o cupom para o mundo inteiro fora do Brasil.
        usedByCpf: cpfDoPedido.length === 11 ? unique([...usedByCpf, cpfDoPedido]) : usedByCpf,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    if (registeredUser) {
      const coupons = Array.isArray(userData.coupons) ? userData.coupons : [];
      let nextCoupons = coupons;
      if (order.couponSource === 'personal' && order.couponCode) {
        nextCoupons = coupons.map((coupon) => String(coupon.code || '').toUpperCase() === order.couponCode ? { ...coupon, isUsed: true } : coupon);
      }
      if (order.promoCouponCode && !nextCoupons.some((coupon) => String(coupon.code || '').toUpperCase() === String(order.promoCouponCode).toUpperCase())) {
        nextCoupons = [...nextCoupons, {
          id: `promo-${order.promoCode}`,
          code: order.promoCouponCode,
          description: `Cupom promocional ${order.promoCouponCode}`,
          discount: 10,
          discountType: 'percentage',
          expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
          isUsed: false,
        }];
      }
      transaction.update(userRef, {
        points: currentPoints - Number(order.redeemPoints || 0) + Number(order.earnedPoints || 0) + Number(order.promoPoints || 0),
        coupons: nextCoupons,
        // Pagou: a reserva vira débito de verdade na linha acima e sai da lista.
        pointsHolds: semReserva(userData, orderId),
        updatedAt: new Date().toISOString(),
      });
    }

    if (affiliateRef && pendingCommissionRef) {
      const affiliate = affiliateSnap.data();
      const netYen = Number(order.items.filter((item) => !item.freeGift).reduce((sum, item) => sum + Number(item.unitYen || 0) * Number(item.quantity || 0), 0));
      transaction.set(pendingCommissionRef, {
        id: pendingCommissionRef.id,
        affiliateCode: order.affiliateCode,
        netYen,
        commissionYen: Math.round(netYen * Number(affiliate.commissionPercent || 0) / 100),
        orderId,
        buyerEmail: order.customerEmail,
        ownerEmail: affiliate.ownerEmail || '',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }
    if (negotiationRef && byPath.get(negotiationRef.path).exists) {
      transaction.update(negotiationRef, { status: 'used', usedAt: new Date().toISOString(), orderId });
    }
    if (recoveryProfileRef) {
      transaction.set(
        recoveryProfileRef,
        purchaseDiscountProfileUpdate(extractDiscountPercent(order)),
        { merge: true },
      );
    }

    const fulfilledAt = new Date().toISOString();
    transaction.update(orderRef, {
      status: 'confirmed',
      fulfillmentState: 'fulfilled',
      fulfilledAt,
      paymentConfirmed: true,
      paymentConfirmedAt: fulfilledAt,
      paymentConfirmedBy: confirmedBy,
      paymentProvider: provider,
      paymentReference: reference,
      updatedAt: fulfilledAt,
    });
    return { replay: false, order: { ...order, status: 'confirmed', fulfillmentState: 'fulfilled', fulfilledAt } };
  });


  return result;
}

/**
 * Pedido pago que o `fulfillOrder` recusou.
 *
 * O dinheiro já entrou e a mercadoria não vai sair. Até 04/08/2026 isso era
 * silencioso nas duas pontas: o cliente ficava esperando um pedido morto e a
 * loja só descobria se alguém filtrasse o painel por `payment_review` — o
 * caminho normal de descoberta era o chargeback.
 *
 * Três coisas acontecem aqui, nesta ordem de importância:
 *
 * 1. Grava o estado com o que um estorno precisa (`refundPending`,
 *    `refundReference`, `refundAmount`). Se esta escrita falhar, o erro sobe:
 *    é melhor o Stripe repetir o webhook do que perder o registro do único
 *    pedido cobrado e não atendido.
 * 2. Avisa o cliente e a loja. E-mail NUNCA derruba o fluxo — SMTP fora do ar
 *    viraria 500, e 500 no webhook é tempestade de retry do Stripe em cima de
 *    um pedido que já está com problema.
 * 3. Só notifica na TRANSIÇÃO para review. O Stripe entrega evento "pelo menos
 *    uma vez": sem essa trava, cada reentrega mandaria outro par de e-mails
 *    para o mesmo pedido.
 */
export async function markFulfillmentReview(orderId, reason, { paymentIntentId = '', amount = null, currency = '' } = {}) {
  const db = adminDb();
  const orderRef = db.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  const order = snap.exists ? { id: snap.id, ...snap.data() } : null;
  const jaEstavaEmRevisao = order?.fulfillmentState === 'review';
  const agora = new Date().toISOString();
  const codigo = String(reason || 'fulfillment_failed').slice(0, 120);
  const referencia = String(paymentIntentId || order?.stripePaymentIntentId || '');
  // Uma fonte só para o banco e para os dois e-mails. Quando valor/moeda
  // divergem do pedido, o que vale é o que saiu do cartão — é isso que precisa
  // voltar, e é isso que o cliente vê na fatura dele.
  const valorCobrado = amount ?? order?.totalPrice ?? null;
  const moedaCobrada = currency || order?.currency || '';

  await orderRef.set({
    status: 'payment_review',
    fulfillmentState: 'review',
    fulfillmentError: codigo,
    // O pedido foi cobrado e não vai ser separado: fica marcado como devendo
    // estorno até alguém decidir o contrário. É esta flag que um filtro do
    // painel usa para achar dinheiro parado, em vez de varrer status.
    refundPending: true,
    refundReference: referencia,
    refundAmount: valorCobrado,
    refundCurrency: moedaCobrada,
    reviewedAt: jaEstavaEmRevisao ? (order?.reviewedAt || agora) : agora,
    updatedAt: agora,
  }, { merge: true });

  if (!order || jaEstavaEmRevisao) return { notified: false };
  // Pedido morto não pode continuar segurando os pontos do cliente. Falhar
  // aqui não derruba nada: a reserva tem prazo e cai sozinha em 24h.
  await liberarReserva(db, order.userId, orderId).catch((erro) => {
    console.error('[fulfillment] falha ao liberar pontos do pedido em revisao:', erro instanceof Error ? erro.message : erro);
  });
  // Mesmo para promo state: pedido morto libera a reserva de unidade.
  await liberarReservaPromo(db, orderId).catch((erro) => {
    console.error('[fulfillment] falha ao liberar reserva promo do pedido em revisao:', erro instanceof Error ? erro.message : erro);
  });
  const paraEmail = { ...order, stripePaymentIntentId: referencia, totalPrice: valorCobrado, currency: moedaCobrada };
  return { notified: await notificarRevisao(paraEmail, codigo) };
}

/**
 * Devolve ao cliente os pontos que o pedido segurava. Transação porque um
 * checkout simultâneo do mesmo cliente pode estar mexendo na mesma lista.
 */
async function liberarReserva(db, userId, orderId) {
  if (!userId) return;
  const userRef = db.collection('users').doc(userId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(userRef);
    if (!snap.exists) return;
    const dados = snap.data();
    if (!Array.isArray(dados.pointsHolds) || dados.pointsHolds.length === 0) return;
    transaction.update(userRef, {
      pointsHolds: semReserva(dados, orderId),
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Devolve à promoção a unidade que o pedido segurava. Transação porque vários
 * checkouts estão mexendo no mesmo estado. Diferente de pontos: a promoção é
 * global, não por usuário.
 */
async function liberarReservaPromo(db, orderId) {
  const orderRef = db.collection('orders').doc(orderId);
  const homePromoRef = db.collection('siteContent').doc('homePromotion');
  const promoStateRef = refEstadoPromo(db);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists || !orderSnap.data()?.homePromoQuantity) return;
  const order = orderSnap.data();
  const homePromoSnap = await homePromoRef.get();
  const homePromoData = homePromoSnap.exists ? homePromoSnap.data() : null;
  if (!homePromoData) return;

  await db.runTransaction(async (transaction) => {
    const promoStateSnap = await transaction.get(promoStateRef);
    const promoStateData = promoStateSnap.exists ? promoStateSnap.data() : null;
    const novoEstado = semReservaPromo(promoStateData, homePromoData, orderId);
    transaction.set(promoStateRef, novoEstado);
  });
}

/**
 * Os dois e-mails do estado de revisão. Cada envio é isolado: a loja precisa
 * ser avisada mesmo que o endereço do cliente esteja inválido, e vice-versa.
 */
async function notificarRevisao(order, codigo) {
  let enviados = 0;
  if (order.customerEmail) {
    const paraCliente = buildPaymentReviewEmail(order, { reason: codigo });
    const ok = await sendMail({ to: order.customerEmail, ...paraCliente })
      .then(() => true)
      .catch((erro) => {
        console.error('[fulfillment] falha ao avisar cliente do pedido em revisao:', erro instanceof Error ? erro.message : erro);
        return false;
      });
    if (ok) enviados += 1;
  }
  const emailLoja = process.env.ORDER_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  if (emailLoja) {
    const paraLoja = buildPaymentReviewEmail(order, { reason: codigo, store: true });
    const ok = await sendMail({ to: emailLoja, ...paraLoja })
      .then(() => true)
      .catch((erro) => {
        console.error('[fulfillment] falha ao avisar a loja do pedido em revisao:', erro instanceof Error ? erro.message : erro);
        return false;
      });
    if (ok) enviados += 1;
  }
  return enviados > 0;
}
