import { randomBytes } from 'node:crypto';
import { promoOffer } from '../shared/promo-offer.js';
import { requireAdmin, requireUser } from './_lib/auth.js';
import { isOptedOut, optedOutAmong, setOptOut } from './_lib/email-optout.js';
import { adminAuth, adminDb } from './_lib/firebase-admin.js';
import {
  assertExactKeys,
  escapeHtml,
  handleCors,
  HttpError,
  normalizeEmail,
  optionalText,
  parseJsonObject,
  requiredText,
  sendError,
} from './_lib/http.js';
import { buildOrderEmail, sendMail, siteOrigin, unsubscribeUrl, wrapEmail } from './_lib/mailer.js';
import { sendPush } from './_lib/push.js';
import { enforceRateLimit } from './_lib/rate-limit.js';

async function accountTemplate(type, to, name) {
  const safeName = escapeHtml(name);
  const salutation = safeName ? `Ola, <strong>${safeName}</strong>.` : 'Ola.';
  if (type === 'verify') {
    const link = await adminAuth().generateEmailVerificationLink(to, {
      url: `${siteOrigin()}/login?verified=1`,
      handleCodeInApp: false,
    });
    const safeLink = escapeHtml(link);
    return {
      subject: 'Confirme seu e-mail - NikkeyBox',
      html: wrapEmail(`<p>${salutation}</p><p>Confirme que este e-mail pertence a voce:</p><p><a href="${safeLink}" style="display:inline-block;background:#a855f7;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold">Confirmar meu e-mail</a></p><p style="word-break:break-all">${safeLink}</p><p>Se voce nao criou esta conta, ignore esta mensagem.</p>`),
    };
  }
  if (type === 'reset') {
    const link = await adminAuth().generatePasswordResetLink(to, {
      url: `${siteOrigin()}/login`,
      handleCodeInApp: false,
    });
    const safeLink = escapeHtml(link);
    return {
      subject: 'Redefinir sua senha - NikkeyBox',
      html: wrapEmail(`<p>${salutation}</p><p>Recebemos um pedido para redefinir a senha da sua conta.</p><p><a href="${safeLink}" style="display:inline-block;background:#a855f7;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold">Criar nova senha</a></p><p style="word-break:break-all">${safeLink}</p><p>O link vale por tempo limitado. Se voce nao pediu isso, ignore esta mensagem: sua senha atual continua valendo.</p>`),
    };
  }
  return {
    subject: 'Cadastro recebido - NikkeyBox',
    html: wrapEmail(`<p>${salutation}</p><p>Seu cadastro foi recebido. Confirme seu e-mail antes de entrar na loja.</p><p><a href="${siteOrigin()}/login">Ir para o login</a></p>`),
  };
}

async function loadOrder(orderId) {
  const snap = await adminDb().collection('orders').doc(orderId).get();
  if (!snap.exists) throw new HttpError(404, 'order_not_found');
  return { id: snap.id, ...snap.data() };
}

const MECHANICS = new Set(['none', 'discount', 'bogo', 'bogo_other', 'points', 'coupon']);
const CHANNELS = new Set(['email', 'app', 'both']);

function integer(value, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new HttpError(400, 'invalid_request');
  return parsed;
}

function cleanCampaign(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'invalid_request');
  assertExactKeys(raw, ['mechanic', 'productId', 'giftProductId', 'couponCode', 'discountPct', 'keepProductDiscount', 'points', 'expiresInDays']);
  const mechanic = requiredText(raw.mechanic, { max: 20 });
  if (!MECHANICS.has(mechanic)) throw new HttpError(400, 'invalid_request');
  return {
    mechanic,
    productId: optionalText(raw.productId, { max: 120 }),
    giftProductId: optionalText(raw.giftProductId, { max: 120 }),
    couponCode: optionalText(raw.couponCode, { max: 40 }).toUpperCase(),
    discountPct: mechanic === 'discount' ? integer(raw.discountPct, 1, 90) : 0,
    keepProductDiscount: raw.keepProductDiscount === true,
    points: mechanic === 'points' ? integer(raw.points, 1, 100000) : 0,
    expiresInDays: raw.expiresInDays === undefined ? 30 : integer(raw.expiresInDays, 1, 90),
  };
}

function offerFor(campaign, product, giftProduct) {
  return promoOffer({
    mechanic: campaign.mechanic,
    discountPct: campaign.discountPct,
    keepProductDiscount: campaign.keepProductDiscount,
    points: campaign.points,
    couponCode: campaign.couponCode,
    productName: product?.name || '',
    // O desconto que o produto já carrega. Sem isto o e-mail anunciava só o
    // extra da campanha ("15% de desconto") enquanto o painel prometia a soma.
    productDiscountPercent: product?.discountPercent || 0,
    giftProductName: giftProduct?.name || '',
  });
}

function promoEmail({ subject, headline, extraMessage, ctaLabel, offer, product, url, unsub }) {
  const image = product?.thumbnail || product?.image;
  const imageHtml = image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" style="width:100%;max-height:320px;object-fit:contain">` : '';
  // O bloco da oferta empilhava selo, título e frase como três linhas soltas —
  // "-15%" em cima de "15% de desconto" em cima de "Aproveite X com 15% de
  // desconto" —, três vezes a mesma informação e nenhuma explicação de como os
  // descontos se somam. Agora o selo é o número grande, o título diz de onde vem
  // cada parte, e a frase explica o que o link faz.
  const cupomHtml = offer.couponLabel
    ? `<p style="margin:10px 0 0;font-size:13px;color:#7c2d12">O cupom <strong>${escapeHtml(offer.couponLabel)}</strong> é aplicado pelo próprio link, uma vez por cliente. Não precisa digitar nada.</p>`
    : '';
  const ofertaHtml = `<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:12px;padding:18px;text-align:center">
    <div style="font-size:30px;line-height:1.1;font-weight:800;color:#c2410c">${escapeHtml(offer.badge)}</div>
    <div style="font-size:15px;font-weight:700;color:#111827;margin-top:6px">${escapeHtml(offer.tagline)}</div>
    <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:10px 0 0">${escapeHtml(offer.description)}</p>
    ${cupomHtml}
  </div>`;
  return {
    subject,
    html: wrapEmail(`<h2>${escapeHtml(headline)}</h2>${imageHtml}<h3>${escapeHtml(product?.name || '')}</h3>${ofertaHtml}<p>${escapeHtml(extraMessage)}</p><p style="text-align:center"><a href="${escapeHtml(url)}" style="display:inline-block;background:#a855f7;color:#fff;text-decoration:none;padding:16px 32px;border-radius:12px;font-weight:bold;font-size:16px">${escapeHtml(ctaLabel)}</a></p><p style="text-align:center;font-size:12px;color:#6b7280;margin-top:-6px">O link já abre o carrinho com o produto e os descontos aplicados.</p>`, { unsubscribeUrl: unsub }),
  };
}

async function handleEmail(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;

  try {
    const body = parseJsonObject(req.body);
    const type = requiredText(body.type, { max: 20 });

    if (type === 'verify' || type === 'welcome') {
      assertExactKeys(body, ['type', 'to', 'name']);
      const user = await requireUser(req);
      const to = normalizeEmail(body.to);
      if (!user.email || normalizeEmail(user.email) !== to) throw new HttpError(403, 'forbidden');
      await enforceRateLimit(req, { scope: `email:${type}`, limit: 4, windowMs: 60 * 60 * 1000, identity: user.uid });
      const template = await accountTemplate(type, to, optionalText(body.name, { max: 100 }));
      const result = await sendMail({ to, ...template });
      res.status(200).json({ ok: true, type, ...result });
      return;
    }

    // Reenvio pelo painel do admin. Existe porque o caminho normal depende da
    // sessão do próprio cliente estar viva no navegador dele — e quando isso
    // falha, a conta é criada e NINGUÉM fica sabendo que o link não saiu. Aqui
    // quem autentica é o admin, então dá para destravar qualquer cliente já
    // cadastrado sem depender de nada do lado dele.
    if (type === 'verify-admin') {
      assertExactKeys(body, ['type', 'to', 'name']);
      const admin = await requireAdmin(req);
      await enforceRateLimit(req, { scope: 'email:verify-admin', limit: 60, windowMs: 60 * 60 * 1000, identity: admin.uid });
      const to = normalizeEmail(body.to);
      const template = await accountTemplate('verify', to, optionalText(body.name, { max: 100 }));
      const result = await sendMail({ to, ...template });
      res.status(200).json({ ok: true, type, ...result });
      return;
    }

    // Recuperacao de senha. Unico tipo que NAO exige sessao — quem esqueceu a
    // senha nao consegue entrar para provar quem e. Antes isso saia pelo
    // Firebase, de noreply@<projeto>.firebaseapp.com com o assunto
    // "Reset your password for <nome do projeto>": remetente desconhecido para
    // o cliente, fora do dominio autenticado por SPF/DKIM da loja e invisivel
    // na caixa de Enviados. Agora sai pelo mesmo caminho dos demais.
    if (type === 'password-reset') {
      assertExactKeys(body, ['type', 'to']);
      const to = normalizeEmail(body.to);
      // Dois limites, porque o endpoint e aberto: por IP trava a varredura de
      // contas; por e-mail impede encher a caixa de uma vitima especifica.
      await enforceRateLimit(req, { scope: 'email:password-reset:ip', limit: 10, windowMs: 60 * 60 * 1000 });
      await enforceRateLimit(req, { scope: 'email:password-reset:conta', limit: 4, windowMs: 60 * 60 * 1000, identity: to });
      try {
        const template = await accountTemplate('reset', to);
        await sendMail({ to, ...template });
      } catch (error) {
        // Conta inexistente responde exatamente como um envio bem-sucedido.
        // Revelar a diferenca transformaria este endpoint numa sonda para
        // descobrir quais e-mails tem conta na loja. Qualquer OUTRA falha
        // propaga normalmente, para o cliente poder reagir.
        if (error?.code !== 'auth/user-not-found') throw error;
      }
      res.status(200).json({ ok: true, type });
      return;
    }

    if (type === 'order') {
      assertExactKeys(body, ['type', 'orderId']);
      const user = await requireUser(req);
      const order = await loadOrder(requiredText(body.orderId, { max: 80, pattern: /^[A-Za-z0-9_-]+$/ }));
      const ownerEmail = String(order.customerEmail || order.email || '').toLowerCase();
      if (order.userId !== user.uid && ownerEmail !== String(user.email || '').toLowerCase()) {
        throw new HttpError(403, 'forbidden');
      }
      await enforceRateLimit(req, { scope: 'email:order', limit: 12, windowMs: 60 * 60 * 1000, identity: user.uid });
      const template = buildOrderEmail(order);
      const result = await sendMail({ to: normalizeEmail(ownerEmail), ...template });
      res.status(200).json({ ok: true, type, ...result });
      return;
    }

    if (type === 'tracking' || type === 'store') {
      assertExactKeys(body, ['type', 'orderId']);
      const admin = await requireAdmin(req);
      await enforceRateLimit(req, { scope: `email:${type}`, limit: 200, windowMs: 60 * 60 * 1000, identity: admin.uid });
      const order = await loadOrder(requiredText(body.orderId, { max: 80, pattern: /^[A-Za-z0-9_-]+$/ }));
      const to = type === 'store'
        ? normalizeEmail(process.env.ORDER_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL)
        : normalizeEmail(order.customerEmail || order.email);
      const template = buildOrderEmail(order, { tracking: type === 'tracking', store: type === 'store' });
      const result = await sendMail({ to, ...template });
      res.status(200).json({ ok: true, type, ...result });
      return;
    }

    throw new HttpError(400, 'unsupported_email_type');
  } catch (error) {
    console.error('[send-email]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

async function handlePush(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;

  try {
    const admin = await requireAdmin(req);
    await enforceRateLimit(req, {
      scope: 'send-push',
      limit: 30,
      windowMs: 60 * 60 * 1000,
      identity: admin.uid,
    });

    const body = parseJsonObject(req.body);
    assertExactKeys(body, ['emails', 'title', 'body', 'url', 'tag']);
    if (!Array.isArray(body.emails) || body.emails.length < 1 || body.emails.length > 500) {
      throw new HttpError(400, 'invalid_recipients');
    }
    const emails = body.emails.map(normalizeEmail);
    const result = await sendPush({
      emails,
      title: requiredText(body.title, { max: 100 }),
      body: requiredText(body.body, { max: 300 }),
      url: optionalText(body.url, { max: 500 }) || '/',
      tag: optionalText(body.tag, { max: 50 }) || 'promo',
    });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('[send-push]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

async function handlePromoCampaign(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;

  try {
    const admin = await requireAdmin(req);
    await enforceRateLimit(req, { scope: 'promo-campaign', limit: 10, windowMs: 60 * 60 * 1000, identity: admin.uid });
    const body = parseJsonObject(req.body);
    assertExactKeys(body, ['campaign', 'recipients', 'channel', 'subject', 'headline', 'extraMessage', 'ctaLabel', 'cancelHomePromotion']);
    const campaign = cleanCampaign(body.campaign);
    const channel = requiredText(body.channel, { max: 10 });
    if (!CHANNELS.has(channel)) throw new HttpError(400, 'invalid_request');
    if (!Array.isArray(body.recipients) || body.recipients.length < 1 || body.recipients.length > 500) throw new HttpError(400, 'invalid_recipients');
    const recipients = [...new Set(body.recipients.map(normalizeEmail))];
    const subject = requiredText(body.subject, { max: 140 });
    const headline = requiredText(body.headline, { max: 160 });
    const extraMessage = requiredText(body.extraMessage, { max: 600 });
    const ctaLabel = requiredText(body.ctaLabel, { max: 80 });

    const db = adminDb();
    const productSnap = campaign.productId ? await db.collection('products').doc(campaign.productId).get() : null;
    if (campaign.productId && !productSnap?.exists) throw new HttpError(400, 'invalid_product');
    const product = productSnap?.data() || null;
    let giftProduct = null;
    if (campaign.mechanic === 'bogo_other') {
      if (!campaign.giftProductId) throw new HttpError(400, 'invalid_gift_product');
      const giftSnap = await db.collection('products').doc(campaign.giftProductId).get();
      if (!giftSnap.exists) throw new HttpError(400, 'invalid_gift_product');
      giftProduct = giftSnap.data();
    }
    if (campaign.mechanic === 'coupon' && !campaign.couponCode) throw new HttpError(400, 'invalid_coupon');

    const code = `PROMO-${randomBytes(3).toString('hex').toUpperCase()}`;
    const now = Date.now();
    const offer = offerFor(campaign, product, giftProduct);
    const stored = {
      code,
      ...campaign,
      ...offer,
      productName: product?.name || '',
      productImage: product?.thumbnail || product?.image || '',
      createdAt: now,
      createdBy: admin.uid,
      expiresAt: now + campaign.expiresInDays * 86400000,
      active: true,
      perCpfLimit: 1,
    };
    delete stored.expiresInDays;

    const campaignRef = db.collection('promo_campaigns').doc(code.toLowerCase());
    const feedRef = db.collection('siteContent').doc('promoNotifications');
    await db.runTransaction(async (transaction) => {
      const feedSnap = await transaction.get(feedRef);
      const previous = Array.isArray(feedSnap.data()?.items) ? feedSnap.data().items : [];
      transaction.create(campaignRef, stored);
      transaction.set(feedRef, {
        items: [{ code, ...offer, productId: campaign.productId || '', productName: product?.name || '', productImage: product?.thumbnail || product?.image || '', createdAt: now, expiresAt: stored.expiresAt }, ...previous].slice(0, 10),
        updatedAt: now,
      });
      if (body.cancelHomePromotion === true) transaction.delete(db.collection('siteContent').doc('homePromotion'));
    });

    // Cai no CARRINHO com o produto dentro e a promoção armada: é a tela onde os
    // dois descontos aparecem somados e o botão de pagamento fica ao lado. Antes
    // caía na página do produto, e ainda era preciso achar "adicionar ao
    // carrinho" — degrau onde a campanha morria.
    //
    // Não é o checkout direto de propósito: `Checkout.tsx` manda quem não está
    // autenticado para /cadastro, então o link levaria boa parte da lista para um
    // formulário em vez da oferta.
    const path = campaign.productId
      ? `/carrinho?promo=${encodeURIComponent(code)}&add=${encodeURIComponent(campaign.productId)}`
      : `/carrinho?promo=${encodeURIComponent(code)}`;
    const url = `${siteOrigin()}${path}`;
    const results = [];
    if (channel === 'email' || channel === 'both') {
      // Uma leitura em lote resolve a lista inteira. Antes de existir o
      // cancelamento por link, esta campanha era o unico caminho que mandava
      // e-mail para quem nunca pediu nada — e nao havia como parar.
      const cancelados = await optedOutAmong(recipients);
      for (const to of recipients) {
        if (cancelados.has(to)) {
          results.push({ email: to, channel: 'email', ok: false, reason: 'unsubscribed' });
          continue;
        }
        // O link e por destinatario: o template nao pode ser reaproveitado.
        const unsub = unsubscribeUrl(to);
        const template = promoEmail({ subject, headline, extraMessage, ctaLabel, offer, product, url, unsub });
        try {
          await sendMail({ to, ...template, unsubscribe: unsub });
          results.push({ email: to, channel: 'email', ok: true });
        } catch {
          results.push({ email: to, channel: 'email', ok: false });
        }
      }
    }
    let push = null;
    if (channel === 'app' || channel === 'both') {
      push = await sendPush({ emails: recipients, title: offer.tagline, body: offer.description, url: path });
      results.push(...push.results.map((result) => ({ ...result, channel: 'app' })));
    }

    res.status(200).json({ ok: true, code, results, push });
  } catch (error) {
    console.error('[promo-campaign]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

/**
 * Preferência de e-mail do próprio cliente, usada pelo botão do perfil.
 *
 * Existe porque `email_optout` é gravado pelo Admin SDK e o cliente não pode
 * escrever direto: o ID do documento é um hash do endereço, e as regras do
 * Firestore não têm como calcular hash para provar que aquele documento é de
 * quem está pedindo. Aqui quem prova é o token do Firebase.
 *
 * Com isso o botão do perfil e o link do rodapé do e-mail passam a mexer no
 * MESMO registro. Antes o perfil gravava `whatsappMarketing`, que nenhum
 * endpoint de envio lia — o cliente desligava e continuava recebendo.
 */
async function handleEmailPreference(req, res) {
  if (!handleCors(req, res, { methods: ['GET', 'POST'] })) return;

  try {
    const user = await requireUser(req);
    // Sessão anônima (a do checkout) não tem endereço para preferir nada.
    if (!user.email) throw new HttpError(403, 'forbidden');
    const email = normalizeEmail(user.email);

    if (req.method === 'GET') {
      res.status(200).json({ ok: true, subscribed: !(await isOptedOut(email)) });
      return;
    }

    const body = parseJsonObject(req.body);
    assertExactKeys(body, ['subscribed']);
    if (typeof body.subscribed !== 'boolean') throw new HttpError(400, 'invalid_request');
    await enforceRateLimit(req, { scope: 'email-preference', limit: 30, windowMs: 60 * 60 * 1000, identity: user.uid });
    await setOptOut(email, { optedOut: !body.subscribed, source: 'profile' });
    res.status(200).json({ ok: true, subscribed: body.subscribed });
  } catch (error) {
    console.error('[email-preference]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

export default async function handler(req, res) {
  const { action } = req.query;
  if (action === 'email') return handleEmail(req, res);
  if (action === 'push') return handlePush(req, res);
  if (action === 'promo-campaign') return handlePromoCampaign(req, res);
  if (action === 'email-preference') return handleEmailPreference(req, res);
  return res.status(400).json({ error: 'invalid_action' });
}

export { handleEmail, handlePush, handlePromoCampaign, handleEmailPreference };
