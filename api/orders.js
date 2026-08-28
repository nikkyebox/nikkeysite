import { randomInt } from 'node:crypto';
import Stripe from 'stripe';
import { requireAdmin, requireUser } from './_lib/auth.js';
import { buildQuote } from './_lib/commerce.js';
import { assertCouponEligibility } from './_lib/coupon-eligibility.js';
import { adminDb } from './_lib/firebase-admin.js';
import { comReserva, pontosDisponiveis } from './_lib/points-hold.js';
import { comReservaPromo, quantidadeReservada, refEstadoPromo, semReservaPromo } from './_lib/promo-reserve.js';
import { comReservaEstoque, estoqueDisponivel } from './_lib/stock-hold.js';
import { indiceDePessoaId, promoUsageId } from './_lib/promo-identity.js';
import { fulfillOrder } from './_lib/fulfillment.js';
import { recentProductSpendYen } from './_lib/loyalty-tier.js';
import { issuePsFeeWaiver, verifyPsFeeWaiver } from './_lib/ps-fee-waiver.js';
import { getFxRates } from './_lib/fx.js';
import {
  assertExactKeys,
  handleCors,
  HttpError,
  normalizeEmail,
  optionalText,
  parseJsonObject,
  requiredText,
  sendError,
} from './_lib/http.js';
import { buildOrderEmail, sendMail } from './_lib/mailer.js';
import { enforceRateLimit } from './_lib/rate-limit.js';

const PAYMENT_METHODS = new Set(['card', 'pix', 'bank', 'paypay', 'yucho', 'wise']);
const ORDER_PATTERN = /^(?:SC-JP|SE-[A-Z]{2})-\d{6}$/;

function parseItems(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) throw new HttpError(400, 'invalid_items');
  return raw.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(400, 'invalid_items');
    assertExactKeys(item, ['productId', 'variantId', 'quantity']);
    return {
      productId: requiredText(item.productId, { max: 120, pattern: /^[A-Za-z0-9_.-]+$/ }),
      variantId: requiredText(item.variantId, { max: 120, pattern: /^[A-Za-z0-9_.-]+$/ }),
      quantity: Number(item.quantity),
    };
  });
}

function parseCustomer(raw, user, country) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'invalid_customer');
  assertExactKeys(raw, ['name', 'email', 'phone', 'cpf', 'postalCode', 'city', 'address', 'building']);
  const tokenEmail = user.email ? normalizeEmail(user.email) : '';
  const submittedEmail = normalizeEmail(raw.email);
  if (tokenEmail && tokenEmail !== submittedEmail) throw new HttpError(403, 'email_mismatch');
  const cpf = String(raw.cpf || '').replace(/\D/g, '');
  if (cpf && cpf.length !== 11) throw new HttpError(400, 'invalid_cpf');
  // A aduana brasileira exige o CPF do destinatário, então para o Brasil ele
  // não é opcional na prática — o pedido sem CPF trava na importação. Exigir
  // aqui, além de evitar esse travamento, é o que dá ao guarda de cupom uma
  // âncora que o cliente não troca à vontade (ver ALTO 3 do AUDITORIA.md).
  // Fora do Brasil não há documento equivalente e o campo segue opcional.
  if (country === 'Brasil' && cpf.length !== 11) throw new HttpError(400, 'cpf_required');
  return {
    name: requiredText(raw.name, { max: 120 }),
    email: tokenEmail || submittedEmail,
    phone: optionalText(raw.phone, { max: 40 }),
    cpf,
    postalCode: requiredText(raw.postalCode, { max: 24 }),
    city: requiredText(raw.city, { max: 120 }),
    address: requiredText(raw.address, { max: 240 }),
    building: optionalText(raw.building, { max: 160 }),
  };
}

function carrierId(value) {
  const text = String(value || '').toLowerCase();
  if (['yuubin', 'yamato', 'sagawa', 'eraito', 'kozutsumi-air', 'ems'].includes(text)) return text;
  if (text.includes('yamato')) return 'yamato';
  if (text.includes('sagawa')) return 'sagawa';
  if (text.includes('local') || text.includes('ゆうパック')) return 'yuubin';
  if (text.includes('e-light') || text.includes('パケットライト')) return 'eraito';
  if (text.includes('kozutsumi') || text.includes('小包')) return 'kozutsumi-air';
  if (text.includes('ems')) return 'ems';
  throw new HttpError(400, 'invalid_shipping');
}

function activeByDate(value) {
  if (!value) return true;
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

async function resolveCoupon(db, code, userDoc, customer, productSubtotalHint = 0, userId = '', emailVerified = false) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  const personal = Array.isArray(userDoc?.coupons)
    ? userDoc.coupons.find((coupon) => String(coupon.code || '').toUpperCase() === normalized)
    : null;
  if (personal) {
    if (personal.isUsed || !activeByDate(personal.expiresAt)) throw new HttpError(409, 'coupon_unavailable');
    return { ...personal, code: normalized, source: 'personal' };
  }

  const [globalSnap, usageSnap, affiliateSnap] = await Promise.all([
    db.collection('coupons').doc(normalized).get(),
    db.collection('coupon_usage').doc(normalized).get(),
    db.collection('affiliates').doc(normalized).get(),
  ]);
  if (globalSnap.exists) {
    const coupon = globalSnap.data();
    if (coupon.isActive === false || !activeByDate(coupon.expiryDate) || (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit))) {
      throw new HttpError(409, 'coupon_unavailable');
    }
    if (Array.isArray(usageSnap.data()?.usedBy) && usageSnap.data().usedBy.map((email) => String(email).toLowerCase()).includes(customer.email)) {
      throw new HttpError(409, 'coupon_already_used');
    }
    await assertCouponEligibility(db, coupon, {
      uid: userId,
      email: customer.email,
      emailVerified,
      userDoc,
      productSubtotalYen: productSubtotalHint,
    });
    return { ...coupon, code: normalized, discountType: coupon.type === 'fixed' ? 'fixed' : 'percentage', source: 'global' };
  }
  if (affiliateSnap.exists) {
    const affiliate = affiliateSnap.data();
    if (affiliate.active === false || !activeByDate(affiliate.expiresAt)) throw new HttpError(409, 'coupon_unavailable');
    return {
      code: normalized,
      discount: Number(affiliate.discountPercent || 0),
      discountType: 'percentage',
      affiliateCode: normalized,
      affiliateProductId: affiliate.productId || '',
      commissionPercent: Number(affiliate.commissionPercent || 0),
      ownerEmail: affiliate.ownerEmail || '',
      source: 'affiliate',
    };
  }
  throw new HttpError(404, 'coupon_not_found');
}

function publicOrder(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    status: order.status,
    orderDate: order.orderDate,
    totalPrice: order.totalPrice,
    total: order.total,
    totalAmount: order.totalAmount,
    totalYen: order.totalYen,
    currency: order.currency,
    paymentMethod: order.paymentMethod,
    trackingCode: order.trackingCode,
    couponCode: order.couponCode,
    couponDiscountYen: order.couponDiscountYen,
    taxAmount: order.taxAmount,
    shippingCarrier: order.shippingCarrier,
    shippingCostYen: order.shippingCostYen,
    shipping: order.shipping,
    psFeeYen: order.psFeeYen,
    // Congelado no momento da compra (mesma função que gerou `total`) — a
    // tela de confirmação precisa mostrar EXATAMENTE essas linhas, não
    // recalcular com a cotação de agora, senão a soma diverge do total pago.
    priceBreakdown: order.priceBreakdown,
    psFeeWaiverApplied: order.psFeeWaiverApplied === true,
    shippingAddress: order.shippingAddress,
    items: order.items.map(({ cost, ...item }) => item),
  };
}

async function stripeIntent(order) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new HttpError(503, 'stripe_not_configured');
  // O webhook não é opcional: `handleConfirmManualPayment` recusa pedido de
  // cartão com `stripe_orders_require_webhook`, então `payment_intent.succeeded`
  // é o ÚNICO caminho que processa a venda. Sem `STRIPE_WEBHOOK_SECRET` o
  // cliente pagaria de verdade e o pedido ficaria parado para sempre — sem
  // baixa de estoque, sem e-mail, e sem ninguém conseguir destravar pelo
  // painel. Recusar antes de cobrar é o único desfecho honesto.
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'stripe_webhook_not_configured');
  const stripe = new Stripe(secret);
  if (order.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    return existing;
  }
  const zeroDecimal = order.currency === 'JPY';
  const amount = zeroDecimal ? Math.round(order.totalPrice) : Math.round(order.totalPrice * 100);
  if (amount < (zeroDecimal ? 50 : 50)) throw new HttpError(400, 'amount_below_minimum');
  return stripe.paymentIntents.create({
    amount,
    currency: order.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    description: `NikkeyBox - Order ${order.orderNumber}`,
    receipt_email: order.customerEmail,
    metadata: { orderId: order.orderNumber, userId: order.userId },
  }, { idempotencyKey: `payment-intent:${order.orderNumber}` });
}

/**
 * Registra no painel de Fraude uma tentativa que o servidor acabou de recusar.
 *
 * Nunca pode derrubar a resposta: se a gravação falhar, o cliente ainda recebe
 * o 409 correto. Perder uma linha de log é bem menos grave do que transformar
 * um bloqueio em erro 500.
 *
 * O formato acompanha o que `FraudDashboard.tsx` já lê — `cpf` mascarado para
 * exibição e `cpfFull` para a busca.
 */
async function registrarTentativaFraude(db, customer, { attemptType, productId = '', affiliateCode = '' }) {
  const digitos = String(customer.cpf || '').replace(/\D/g, '');
  if (digitos.length !== 11) return;
  try {
    await db.collection('fraud_attempts').add({
      cpf: `${digitos.slice(0, 3)}***${digitos.slice(6)}`,
      cpfFull: digitos,
      attemptType,
      productId,
      affiliateCode,
      customerEmail: customer.email || '',
      customerName: customer.name || '',
      blockedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[fraud-log]', error instanceof Error ? error.message : error);
  }
}

async function handleMarkReceived(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;

  try {
    const user = await requireUser(req);
    const body = parseJsonObject(req.body);
    assertExactKeys(body, ['orderId']);
    const orderId = requiredText(body.orderId, { max: 80, pattern: /^[A-Za-z0-9_-]+$/ });
    const orderRef = adminDb().collection('orders').doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) throw new HttpError(404, 'order_not_found');

    const order = snap.data();
    const tokenEmail = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    const customerEmail = typeof order.customerEmail === 'string' ? order.customerEmail.trim().toLowerCase() : '';
    const isOwner = order.userId === user.uid
      || (tokenEmail !== '' && customerEmail !== '' && tokenEmail === customerEmail);
    if (!isOwner) throw new HttpError(403, 'forbidden');

    if (order.status === 'delivered' && order.customerConfirmedAt) {
      res.status(200).json({ ok: true, alreadyConfirmed: true });
      return;
    }
    const paid = order.paymentConfirmed === true
      || order.fulfillmentState === 'fulfilled'
      || ['confirmed', 'shipped', 'in_transit', 'out_for_delivery'].includes(order.status);
    if (!paid || order.status === 'cancelled') {
      throw new HttpError(409, 'order_not_receivable');
    }

    const now = new Date().toISOString();
    await orderRef.update({
      status: 'delivered',
      updatedAt: now,
      customerConfirmedAt: now,
      customerConfirmedBy: tokenEmail || user.uid,
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[mark-received]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

async function handleIssuePsFeeWaiver(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;
  try {
    const user = await requireUser(req);
    await enforceRateLimit(req, {
      scope: 'ps-fee-waiver',
      limit: 5,
      windowMs: 60 * 60 * 1000,
      identity: user.uid,
    });
    const issued = issuePsFeeWaiver(user.uid);
    res.status(200).json({ ok: true, token: issued.token, expiresAt: issued.expiresAt });
  } catch (error) {
    console.error('[ps-fee-waiver]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

async function handleCreate(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;

  try {
    const user = await requireUser(req);
    await enforceRateLimit(req, { scope: 'create-order', limit: 12, windowMs: 30 * 60 * 1000, identity: user.uid });
    const body = parseJsonObject(req.body);
    assertExactKeys(body, ['orderId', 'items', 'country', 'prefecture', 'state', 'shippingCarrier', 'paymentMethod', 'couponCode', 'redeemPoints', 'negotiationId', 'promoCode', 'psFeeWaiverToken', 'customer']);
    const orderId = requiredText(body.orderId, { max: 40, pattern: ORDER_PATTERN });
    const requestedItems = parseItems(body.items);
    const country = requiredText(body.country, { max: 100 });
    // `prefecture` é a província japonesa e só existe em endereço do Japão.
    // Exigi-la sempre rejeitava TODO pedido internacional com
    // `400 invalid_request`, porque `requiredText` recusa string vazia e o
    // formulário manda '' quando o país não é o Japão. Como o público da loja
    // é o Brasil, isso zerava as vendas: 63 visitas ao checkout, 0 pedidos.
    // Fora do Japão o frete usa `internationalZone(country)` e o imposto usa
    // `state || prefecture` — nenhum dos dois precisa da província.
    const prefecture = country === 'Japão'
      ? requiredText(body.prefecture, { max: 100 })
      : optionalText(body.prefecture, { max: 100 });
    const state = optionalText(body.state, { max: 100 });
    const carrier = carrierId(body.shippingCarrier);
    const paymentMethod = requiredText(body.paymentMethod, { max: 20 });
    if (!PAYMENT_METHODS.has(paymentMethod)) throw new HttpError(400, 'invalid_payment_method');
    const customer = parseCustomer(body.customer, user, country);
    const couponCode = optionalText(body.couponCode, { max: 60 }).toUpperCase();
    const promoCode = optionalText(body.promoCode, { max: 60 }).toUpperCase();
    const negotiationId = optionalText(body.negotiationId, { max: 120 });
    const psFeeWaiverToken = optionalText(body.psFeeWaiverToken, { max: 1200 });

    const db = adminDb();
    const orderRef = db.collection('orders').doc(orderId);
    const existing = await orderRef.get();
    if (existing.exists) {
      const order = { id: existing.id, ...existing.data() };
      if (order.userId !== user.uid) throw new HttpError(409, 'order_id_conflict');
      const intent = order.paymentMethod === 'card' ? await stripeIntent(order) : null;
      res.status(200).json({ ok: true, order: publicOrder(order), clientSecret: intent?.client_secret || null });
      return;
    }
    const waiver = psFeeWaiverToken ? verifyPsFeeWaiver(psFeeWaiverToken, user.uid) : null;
    if (psFeeWaiverToken && !waiver) throw new HttpError(403, 'invalid_ps_fee_waiver');

    const campaignSnap = promoCode ? await db.collection('promo_campaigns').doc(promoCode.toLowerCase()).get() : null;
    const campaign = campaignSnap?.exists ? campaignSnap.data() : null;
    if (promoCode && (!campaign || campaign.active === false || !activeByDate(campaign.expiresAt))) throw new HttpError(409, 'promotion_unavailable');

    const baseProductIds = requestedItems.map((item) => item.productId.replace(/_promo$/, ''));
    if (campaign?.giftProductId) baseProductIds.push(String(campaign.giftProductId));
    const uniqueProductIds = [...new Set(baseProductIds)];
    const productSnaps = await db.getAll(...uniqueProductIds.map((id) => db.collection('products').doc(id)));
    const products = new Map(productSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, { id: snap.id, ...snap.data() }]));

    const pessoa = { cpf: customer.cpf, userId: user.uid };
    const cpfIndexId = indiceDePessoaId(pessoa);
    const usoPromoId = promoUsageId(promoCode, pessoa);
    const [userSnap, homePromoSnap, promoStateSnap, negotiationSnap, cpfSnap, promoUsageSnap, recentSpendYen] = await Promise.all([
      db.collection('users').doc(user.uid).get(),
      db.collection('siteContent').doc('homePromotion').get(),
      refEstadoPromo(db).get(),
      negotiationId ? db.collection('negotiations').doc(negotiationId).get() : Promise.resolve(null),
      // Mesma âncora do `fulfillment.js`: CPF quando existe, senão a conta.
      // Sem isso a pré-checagem olhava um documento diferente do que a
      // transação de baixa iria travar, e cliente sem CPF passava direto.
      cpfIndexId ? db.collection('cpf_index').doc(cpfIndexId).get() : Promise.resolve(null),
      usoPromoId ? db.collection('promo_usage').doc(usoPromoId).get() : Promise.resolve(null),
      recentProductSpendYen(db, user.uid),
    ]);
    if (promoUsageSnap?.exists) throw new HttpError(409, 'promotion_already_used');
    const userData = userSnap.exists ? userSnap.data() : null;
    // Só o token prova o e-mail. Convidado (`signInAnonymously`) não tem
    // nenhum, e conta registrada sem verificar pode ter se cadastrado com o
    // endereço de outra pessoa — os dois casos não valem como identidade.
    const emailVerificado = user.email_verified === true && Boolean(user.email);
    const coupon = await resolveCoupon(db, couponCode, userData, customer, 0, user.uid, emailVerificado);
    const negotiation = negotiationSnap?.exists ? negotiationSnap.data() : null;
    if (negotiation && negotiation.userId && negotiation.userId !== user.uid) throw new HttpError(403, 'invalid_negotiation');
    if (negotiation && negotiation.customerEmail && String(negotiation.customerEmail).toLowerCase() !== customer.email) throw new HttpError(403, 'invalid_negotiation');
    const requestedPoints = Math.max(0, Math.floor(Number(body.redeemPoints || 0)));
    // Recusa cedo, com a mesma conta da transação, para o cliente ver o erro
    // antes de qualquer cobrança. A palavra final continua sendo a da transação.
    if (requestedPoints > pontosDisponiveis(userData)) throw new HttpError(409, 'insufficient_points');
    const rates = await getFxRates();
    // 'fallback' = nem Wise nem open.er-api responderam: a taxa fixa
    // (¥28/R$) pode estar longe da cotação real e cobrar errado. Silenciar
    // isso e seguir em frente é como o total exibido no checkout divergiu do
    // que foi de fato cobrado. Melhor recusar e o cliente tentar de novo.
    if (rates.source === 'fallback') throw new HttpError(503, 'fx_rate_unavailable');
    const homePromoData = homePromoSnap.exists ? homePromoSnap.data() : null;
    const promoStateData = promoStateSnap.exists ? promoStateSnap.data() : null;
    const reservedCount = homePromoData ? quantidadeReservada(promoStateData, homePromoData) : 0;
    const quote = buildQuote({
      requestedItems,
      products,
      country,
      prefecture,
      state,
      carrier,
      paymentMethod,
      coupon,
      redeemPoints: requestedPoints,
      negotiation,
      campaign,
      homePromotion: homePromoData ? { ...homePromoData, reservedCount } : null,
      rates,
      recentSpendYen,
      psFeeWaived: Boolean(waiver),
    });

    const stockByProduct = new Map();
    for (const item of quote.items) stockByProduct.set(item.productId, (stockByProduct.get(item.productId) || 0) + item.quantity);
    for (const [productId, quantity] of stockByProduct) {
      const product = products.get(productId);
      if (product?.stock?.unlimited === false && Number(product.stock.quantity || 0) < quantity) throw new HttpError(409, 'insufficient_stock');
    }
    const cpfData = cpfSnap?.exists ? cpfSnap.data() : null;
    const promoProducts = quote.items.filter((item) => item.homePromo).map((item) => item.productId);
    // O painel de Fraude nunca recebeu um registro: quem gravava era
    // `cpfGuardService.logFraudAttempt`, no navegador, e nenhuma tela chegou a
    // chamar. Mesmo que chamasse, quem burla o limite é justamente quem tem
    // motivo para não executar esse código. Aqui é o servidor que recusa, então
    // é aqui que o registro tem valor.
    // `!== undefined`, e não truthiness: o bloqueio não pode depender de o id
    // do produto ser uma string não vazia.
    const produtoBloqueado = promoProducts.find((productId) => cpfData?.productIds?.includes(productId));
    if (produtoBloqueado !== undefined) {
      await registrarTentativaFraude(db, customer, { attemptType: 'product_limit', productId: produtoBloqueado });
      throw new HttpError(409, 'promotion_limit');
    }
    if (coupon?.affiliateCode && !coupon.affiliateProductId && cpfData?.affiliateCodes?.length) {
      await registrarTentativaFraude(db, customer, { attemptType: 'affiliate_reuse', affiliateCode: coupon.affiliateCode });
      throw new HttpError(409, 'affiliate_coupon_already_used');
    }

    const now = new Date().toISOString();
    const trackingPrefix = country === 'Japão' ? 'JP' : country === 'Brasil' ? 'NX' : 'EX';
    const order = {
      id: orderId,
      orderNumber: orderId,
      userId: user.uid,
      customerName: customer.name,
      customerEmail: customer.email,
      cpf: customer.cpf,
      status: 'pending_payment',
      fulfillmentState: 'pending',
      paymentConfirmed: false,
      orderDate: now,
      date: new Date().toLocaleDateString('pt-BR'),
      totalPrice: quote.total,
      total: quote.total,
      totalAmount: quote.total,
      totalYen: quote.totalYen,
      currency: quote.currency,
      fxSource: rates.source,
      paymentMethod,
      trackingCode: `${trackingPrefix}${randomInt(100000000, 1000000000)}JP`,
      couponCode: couponCode || '',
      couponSource: coupon?.source || '',
      couponDiscountYen: quote.couponDiscountYen,
      affiliateCode: coupon?.affiliateCode || '',
      affiliateProductId: coupon?.affiliateProductId || '',
      affiliateCommissionPercent: coupon?.commissionPercent || 0,
      affiliateOwnerEmail: coupon?.ownerEmail || '',
      promoCode: promoCode || '',
      promoMechanic: campaign?.mechanic || '',
      redeemPoints: quote.redeemPoints,
      earnedPoints: quote.earnedPoints,
      pointsMultiplier: quote.pointsMultiplier,
      promoPoints: quote.promoPoints,
      psFeeWaiverApplied: quote.psFeeWaiverApplied,
      psFeeWaiverId: quote.psFeeWaiverApplied ? waiver?.id || '' : '',
      promoCouponCode: campaign?.couponCode || '',
      taxAmount: quote.tax,
      // A conta decomposta como o cliente viu, congelada. O câmbio muda todo
      // dia; sem isso, uma contestação meses depois não tem como reconstruir
      // por que o total foi aquele.
      priceBreakdown: quote.display,
      shippingCarrier: carrier,
      shippingCostYen: quote.shippingYen,
      shipping: { carrier, cost: quote.shippingYen, weightG: quote.shippingWeightG },
      psFeeYen: quote.psFeeYen,
      homePromoQuantity: quote.homePromoQuantity,
      negotiationId: negotiationId || '',
      shippingAddress: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        postalCode: customer.postalCode,
        prefecture,
        city: customer.city,
        address: customer.address,
        building: customer.building,
        country,
      },
      items: quote.items.map(({ cost: _cost, ...item }) => item),
      createdAt: now,
      updatedAt: now,
      customerType: user.firebase?.sign_in_provider === 'anonymous' ? 'guest' : 'registered',
    };

    const waiverClaimRef = quote.psFeeWaiverApplied
      ? db.collection('ps_fee_waiver_claims').doc(waiver.id)
      : null;

    // A reserva só entra quando há resgate: pedido sem pontos não paga o custo
    // de ler e reescrever o documento do usuário.
    const userRefParaReserva = quote.redeemPoints > 0 ? db.collection('users').doc(user.uid) : null;
    // Reserva da unidade da promoção da home: só quando há quantidade promocional
    // e a promoção está ativa.
    const promoStateRef = quote.homePromoQuantity > 0 ? refEstadoPromo(db) : null;
    // Só reserva produtos com estoque limitado (`unlimited === false`) — o
    // resto não precisa pagar o custo de ler/reescrever o doc do produto.
    const limitedStockRefs = [...stockByProduct.keys()]
      .filter((productId) => products.get(productId)?.stock?.unlimited === false)
      .map((productId) => db.collection('products').doc(productId));
    await db.runTransaction(async (transaction) => {
      const [current, waiverClaim, userAtual, promoStateAtual, ...stockSnaps] = await Promise.all([
        transaction.get(orderRef),
        waiverClaimRef ? transaction.get(waiverClaimRef) : Promise.resolve(null),
        userRefParaReserva ? transaction.get(userRefParaReserva) : Promise.resolve(null),
        promoStateRef ? transaction.get(promoStateRef) : Promise.resolve(null),
        ...limitedStockRefs.map((ref) => transaction.get(ref)),
      ]);
      if (current.exists) throw new HttpError(409, 'order_id_conflict');
      if (waiverClaim?.exists) throw new HttpError(409, 'ps_fee_waiver_already_used');
      if (userRefParaReserva) {
        // Aqui dentro o saldo é o de verdade: a checagem lá em cima roda fora
        // de transação e não enxerga um checkout simultâneo do mesmo cliente.
        const userAgora = userAtual?.exists ? userAtual.data() : null;
        if (!userAgora) throw new HttpError(409, 'insufficient_points');
        if (quote.redeemPoints > pontosDisponiveis(userAgora)) throw new HttpError(409, 'insufficient_points');
        transaction.update(userRefParaReserva, {
          pointsHolds: comReserva(userAgora, orderId, quote.redeemPoints),
          updatedAt: now,
        });
      }
      // Revalidação atômica do saldo da promoção: a checagem lá em cima roda
      // fora de transação. Se dois checkouts saem da checagem e chegam aqui, um
      // deles vai ver o saldo já reservado e ser recusado. Mesma defesa dos
      // pontos, mas para unidades em vez de saldo numérico.
      if (promoStateRef) {
        const promoStateAgora = promoStateAtual?.exists ? promoStateAtual.data() : null;
        const promoAgora = promoStateAgora ? quantidadeReservada(promoStateAgora, homePromoData) : 0;
        // Retentativa do MESMO pedido não pode competir consigo mesma: o hold
        // anterior dele já está contado em `promoAgora`, e gravar de novo apenas
        // substitui aquele espaço em vez de pedir um novo.
        const holdDestePedido = (promoStateAgora?.holds || [])
          .find((hold) => hold.orderId === orderId && Number(hold.expiresAt || 0) > Date.now());
        const promoAgoraExcluindoEste = promoAgora - Number(holdDestePedido?.quantity || 0);
        const remaining = homePromoData.maxProducts == null
          ? Infinity
          : Number(homePromoData.maxProducts) - Number(homePromoData.soldCount || 0) - promoAgoraExcluindoEste;
        if (quote.homePromoQuantity > remaining) throw new HttpError(409, 'promotion_unavailable');
        const novoEstado = comReservaPromo(promoStateAgora, homePromoData, {
          orderId,
          quantity: quote.homePromoQuantity,
          paymentMethod,
        });
        transaction.set(promoStateRef, novoEstado);
      }
      // Revalidação atômica do estoque: a checagem lá em cima (`stockByProduct`)
      // roda fora de transação, em cima de uma leitura de minutos atrás. Se
      // dois checkouts do mesmo produto saem de lá e chegam aqui, um deles vê
      // a unidade já reservada pelo outro e é recusado — antes de cobrar,
      // porque isto roda ANTES do Stripe (`stripeIntent`, logo abaixo).
      limitedStockRefs.forEach((ref, index) => {
        const productId = ref.id;
        const quantity = stockByProduct.get(productId) || 0;
        const snap = stockSnaps[index];
        const productAgora = snap?.exists ? snap.data() : null;
        if (!productAgora) throw new HttpError(409, 'product_unavailable');
        if (quantity > estoqueDisponivel(productAgora, orderId)) throw new HttpError(409, 'insufficient_stock');
        transaction.update(ref, {
          stockHolds: comReservaEstoque(productAgora, orderId, quantity),
        });
      });
      transaction.create(orderRef, order);
      if (waiverClaimRef) {
        transaction.create(waiverClaimRef, {
          userId: user.uid,
          orderId,
          expiresAt: waiver.expiresAt,
          consumedAt: now,
        });
      }
    });

    let intent = null;
    if (paymentMethod === 'card') {
      intent = await stripeIntent(order);
      await orderRef.update({ stripePaymentIntentId: intent.id, updatedAt: new Date().toISOString() });
      order.stripePaymentIntentId = intent.id;
    }

    res.status(201).json({ ok: true, order: publicOrder(order), clientSecret: intent?.client_secret || null });
  } catch (error) {
    console.error('[create-order]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

async function handleConfirmManualPayment(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;

  try {
    const admin = await requireAdmin(req);
    await enforceRateLimit(req, { scope: 'confirm-manual-payment', limit: 100, windowMs: 60 * 60 * 1000, identity: admin.uid });
    const body = parseJsonObject(req.body);
    assertExactKeys(body, ['orderId', 'reference']);
    const orderId = requiredText(body.orderId, { max: 80, pattern: /^[A-Za-z0-9_-]+$/ });
    const suppliedReference = optionalText(body.reference, { max: 120 });
    const orderRef = adminDb().collection('orders').doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) throw new HttpError(404, 'order_not_found');
    const order = { id: snap.id, ...snap.data() };
    if (order.paymentMethod === 'card') throw new HttpError(409, 'stripe_orders_require_webhook');
    const reference = suppliedReference || `${order.paymentMethod}:${orderId}`;
    const result = await fulfillOrder(orderId, {
      provider: 'manual',
      reference,
      confirmedBy: String(admin.email || admin.uid),
    });

    if (!result.replay) {
      const refreshed = await orderRef.get();
      const fulfilled = { id: refreshed.id, ...refreshed.data() };
      await sendMail({ to: fulfilled.customerEmail, ...buildOrderEmail(fulfilled) }).catch(() => undefined);
      const storeEmail = process.env.ORDER_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
      if (storeEmail) await sendMail({ to: storeEmail, ...buildOrderEmail(fulfilled, { store: true }) }).catch(() => undefined);
    }
    res.status(200).json({ ok: true, replay: result.replay });
  } catch (error) {
    console.error('[confirm-manual-payment]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

export default async function handler(req, res) {
  const { action } = req.query;
  if (action === 'mark-received') return handleMarkReceived(req, res);
  if (action === 'create') return handleCreate(req, res);
  if (action === 'ps-fee-waiver') return handleIssuePsFeeWaiver(req, res);
  if (action === 'confirm-manual-payment') return handleConfirmManualPayment(req, res);
  return res.status(400).json({ error: 'invalid_action' });
}

export { handleCreate, handleMarkReceived, handleConfirmManualPayment, handleIssuePsFeeWaiver };
