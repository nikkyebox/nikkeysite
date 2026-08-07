import { randomUUID } from 'node:crypto';
import { decodeEmail, setOptOut, verifyUnsubscribeToken } from './_lib/email-optout.js';
import { adminDb } from './_lib/firebase-admin.js';
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
import { MAIL_REPLY_TO, sendMail, siteOrigin, unsubscribeUrl, wrapEmail } from './_lib/mailer.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { sendPush } from './_lib/push.js';

const SOURCES = new Set(['exit_intent', 'newsletter_footer', 'guide', 'cart_reminder']);
const SHIPPING = new Set(['aereo', 'maritimo', 'container', 'combinar']);

function optionalEmail(value) {
  return value ? normalizeEmail(value) : '';
}

function optionalUrl(value) {
  const text = optionalText(value, { max: 1000 });
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid');
    return url.toString();
  } catch {
    throw new HttpError(400, 'invalid_request');
  }
}

function customRequest(data) {
  assertExactKeys(data, ['name', 'contact', 'country', 'productDesc', 'referenceLink', 'quantity']);
  return {
    name: requiredText(data.name, { max: 120 }),
    contact: requiredText(data.contact, { max: 254 }),
    country: optionalText(data.country, { max: 80 }),
    productDesc: requiredText(data.productDesc, { max: 2000 }),
    referenceLink: optionalUrl(data.referenceLink),
    quantity: optionalText(data.quantity, { max: 100 }),
  };
}

function b2bRequest(data) {
  assertExactKeys(data, ['razaoSocial', 'cnpj', 'responsavel', 'contact', 'email', 'country', 'productDesc', 'estimatedQty', 'shipping', 'notes']);
  const shipping = requiredText(data.shipping, { max: 20 });
  if (!SHIPPING.has(shipping)) throw new HttpError(400, 'invalid_request');
  return {
    razaoSocial: requiredText(data.razaoSocial, { max: 180 }),
    cnpj: requiredText(data.cnpj, { max: 30 }),
    responsavel: requiredText(data.responsavel, { max: 120 }),
    contact: requiredText(data.contact, { max: 254 }),
    email: optionalEmail(data.email),
    country: optionalText(data.country, { max: 80 }),
    productDesc: requiredText(data.productDesc, { max: 3000 }),
    estimatedQty: requiredText(data.estimatedQty, { max: 120 }),
    shipping,
    notes: optionalText(data.notes, { max: 2000 }),
  };
}

function affiliateRequest(data) {
  assertExactKeys(data, ['name', 'email', 'message']);
  return {
    name: requiredText(data.name, { max: 120 }),
    email: normalizeEmail(data.email),
    message: optionalText(data.message, { max: 2000 }),
  };
}

function newsletter(data) {
  assertExactKeys(data, ['email', 'source']);
  const source = requiredText(data.source, { max: 40 });
  if (!SOURCES.has(source)) throw new HttpError(400, 'invalid_request');
  return { email: normalizeEmail(data.email), source };
}

function parseSubmission(body) {
  assertExactKeys(body, ['type', 'data']);
  const type = requiredText(body.type, { max: 40 });
  const data = parseJsonObject(body.data);
  if (type === 'custom_request') return { type, data: customRequest(data) };
  if (type === 'b2b_request') return { type, data: b2bRequest(data) };
  if (type === 'affiliate_request') return { type, data: affiliateRequest(data) };
  if (type === 'newsletter') return { type, data: newsletter(data) };
  throw new HttpError(400, 'invalid_request');
}

async function persistSubmission(type, data) {
  const db = adminDb();
  const now = new Date().toISOString();
  if (type === 'newsletter') {
    const id = data.email.replace(/[.#$/[\]]/g, '_');
    const ref = db.collection('newsletter').doc(id);
    const existing = await ref.get();
    await ref.set({
      email: data.email,
      source: data.source,
      lastSource: data.source,
      ...(existing.exists ? {} : { createdAt: now }),
      updatedAt: now,
    }, { merge: true });
    return;
  }

  if (type === 'affiliate_request') {
    const ref = db.collection('affiliate_requests').doc(data.email);
    const existing = await ref.get();
    if (existing.exists) throw new HttpError(409, 'already_requested');
    await ref.create({ ...data, status: 'pending', requestedAt: now });
    return;
  }

  const isCustom = type === 'custom_request';
  const id = `${isCustom ? 'req' : 'b2b'}-${randomUUID()}`;
  await db.collection(isCustom ? 'custom_requests' : 'b2b_requests').doc(id).create({
    ...data,
    id,
    status: 'new',
    createdAt: now,
  });
}

// O formulário "Faça seu Pedido" cai numa coleção que ninguém acompanha: sem
// aviso ativo a loja só descobre o pedido quando abre o painel por acaso —
// foi assim que dois ficaram parados sem resposta.
export async function notifyStoreCustomRequest(data) {
  const to = process.env.ORDER_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  if (!to) return;
  const linha = (rotulo, valor) =>
    `<p style="margin:0 0 6px"><strong>${rotulo}:</strong> ${escapeHtml(valor || '—')}</p>`;
  const html = wrapEmail(
    `<h2 style="margin:0 0 12px;font-size:18px">Novo pedido personalizado</h2>`
    + linha('Nome', data.name)
    + linha('Contato', data.contact)
    + linha('País', data.country)
    + linha('Quantidade', data.quantity)
    + linha('Link de referência', data.referenceLink)
    + `<p style="margin:12px 0 6px"><strong>Descrição do produto:</strong></p>`
    + `<p style="margin:0;white-space:pre-wrap">${escapeHtml(data.productDesc || '—')}</p>`
    + `<p style="margin:16px 0 0"><a href="${siteOrigin()}/admin">Abrir no painel</a></p>`,
  );
  const notifications = await Promise.allSettled([
    sendMail({ to, subject: `Novo pedido personalizado — ${data.name}`, html }),
    sendPush({
      emails: String(to).split(',').map((email) => email.trim()).filter(Boolean),
      title: 'Novo pedido personalizado',
      body: `${data.name} enviou uma nova solicitação. Abra o painel para conferir.`,
      url: '/admin',
      tag: 'custom-request',
    }),
  ]);
  notifications.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`[public-submission] aviso ${index === 0 ? 'por e-mail' : 'push'} falhou:`, result.reason);
    }
  });
  if (notifications.every((result) => result.status === 'rejected')) {
    throw notifications[0].reason;
  }
}

async function handleSubmission(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;
  try {
    const submission = parseSubmission(parseJsonObject(req.body));
    await enforceRateLimit(req, {
      scope: `public-submission:${submission.type}`,
      limit: submission.type === 'newsletter' ? 10 : 5,
      windowMs: 60 * 60 * 1000,
    });
    await persistSubmission(submission.type, submission.data);
    if (submission.type === 'custom_request') {
      // O pedido já está gravado: problema de SMTP não pode transformar um
      // envio bem-sucedido em erro na cara do cliente. Só vira log.
      try {
        await notifyStoreCustomRequest(submission.data);
      } catch (error) {
        console.error('[public-submission] aviso de pedido personalizado falhou:', error instanceof Error ? error.message : error);
      }
    }
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('[public-submission]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

function boundedCounter(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function parseEvent(body) {
  assertExactKeys(body, ['type', 'slug', 'label', 'productId', 'productName', 'countryCode', 'city']);
  const type = requiredText(body.type, { max: 20 });
  if (!['visit', 'page', 'product'].includes(type)) throw new HttpError(400, 'invalid_request');

  if (type === 'page') {
    const slug = requiredText(body.slug, { max: 160 });
    if (!slug.startsWith('/') || slug.includes('\\')) throw new HttpError(400, 'invalid_request');
    return { type, slug, label: requiredText(body.label, { max: 160 }) };
  }
  if (type === 'product') {
    return {
      type,
      productId: requiredText(body.productId, { max: 160, pattern: /^[^/]+$/ }),
      productName: requiredText(body.productName, { max: 240 }),
    };
  }

  const countryCode = optionalText(body.countryCode, { max: 2 }).toUpperCase();
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw new HttpError(400, 'invalid_request');
  return { type, countryCode, city: optionalText(body.city, { max: 100 }) };
}

async function incrementEvent(event) {
  const db = adminDb();
  const now = new Date();
  const updatedAt = now.toISOString();

  if (event.type === 'page') {
    const id = event.slug.replace(/\//g, '_').replace(/^_/, '') || 'home';
    const ref = db.collection('analytics_pages').doc(id);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      transaction.set(ref, {
        slug: event.slug,
        label: event.label,
        views: boundedCounter(snap.data()?.views) + 1,
        updatedAt,
      });
    });
    return;
  }

  if (event.type === 'product') {
    const ref = db.collection('analytics_products').doc(event.productId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      transaction.set(ref, {
        productId: event.productId,
        productName: event.productName,
        views: boundedCounter(snap.data()?.views) + 1,
        updatedAt,
      });
    });
    return;
  }

  const date = updatedAt.slice(0, 10);
  const ref = db.collection('analytics_daily').doc(date);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const previous = snap.data() || {};
    const countries = { ...(previous.countries || {}) };
    const cities = { ...(previous.cities || {}) };
    if (event.countryCode && (event.countryCode in countries || Object.keys(countries).length < 250)) {
      countries[event.countryCode] = boundedCounter(countries[event.countryCode]) + 1;
    }
    if (event.city && (event.city in cities || Object.keys(cities).length < 1000)) {
      cities[event.city] = boundedCounter(cities[event.city]) + 1;
    }
    transaction.set(ref, {
      date,
      total: boundedCounter(previous.total) + 1,
      countries,
      cities,
      updatedAt,
    });
  });
}

async function handleAnalytics(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;
  try {
    const event = parseEvent(parseJsonObject(req.body));
    await enforceRateLimit(req, {
      scope: `analytics:${event.type}`,
      limit: event.type === 'visit' ? 30 : 300,
      windowMs: 60 * 60 * 1000,
    });
    await incrementEvent(event);
    res.status(202).json({ ok: true });
  } catch (error) {
    console.error('[analytics]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

const BOTAO = 'display:inline-block;background:#a855f7;color:#fff;border:0;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:bold;font-size:15px;cursor:pointer';
const BOTAO_SECUNDARIO = 'display:inline-block;background:#fff;color:#444;border:1px solid #ddd;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer';
const NOTA = 'font-size:13px;color:#777;margin:18px 0 0';

/** Página completa, sem depender do SPA: o link é aberto de dentro do e-mail. */
function renderPage(res, status, title, body) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(status).end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} - NikkeyBox</title></head><body style="font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;background:#faf7f5;margin:0;padding:40px 16px;color:#333"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:14px;overflow:hidden"><div style="background:linear-gradient(135deg,#a855f7,#f59e0b);padding:20px;text-align:center;color:#fff"><h1 style="margin:0;font-size:20px">NikkeyBox</h1></div><div style="padding:28px;line-height:1.6">${body}</div></div></body></html>`);
}

/**
 * Cancelamento de inscrição pelo link do e-mail — sem login, sem app.
 *
 * O GET NÃO cancela nada: apenas mostra a confirmação. Antivírus corporativo e
 * pré-visualização de link (Outlook, Proofpoint, Gmail) abrem TODO GET que
 * encontram no corpo da mensagem; se o GET já descadastrasse, gente que nunca
 * clicou sumiria da lista sozinha.
 *
 * Quem cancela é o POST — tanto o botão desta página quanto o "One-Click" do
 * RFC 8058, que é o que o Gmail e o Outlook disparam pelo botão nativo de
 * cancelar inscrição ao lado do remetente.
 *
 * O endereço vem assinado no próprio link (HMAC), então não dá para
 * descadastrar terceiros mexendo na URL, e não é preciso guardar um token por
 * envio no banco.
 */
async function handleUnsubscribe(req, res) {
  if (!handleCors(req, res, { methods: ['GET', 'POST'] })) return;

  let email;
  try {
    email = decodeEmail(req.query?.e);
    if (!verifyUnsubscribeToken(email, String(req.query?.t || ''))) throw new HttpError(400, 'invalid_token');
  } catch (error) {
    console.error('[unsubscribe]', error instanceof Error ? error.message : error);
    renderPage(res, error instanceof HttpError ? error.statusCode : 500, 'Link invalido', `<h2 style="margin:0 0 12px;font-size:19px">Link inválido</h2><p>Não foi possível identificar este endereço. O link pode ter sido cortado pelo programa de e-mail ao ser copiado.</p><p>Escreva para <a href="mailto:${MAIL_REPLY_TO}" style="color:#a855f7">${MAIL_REPLY_TO}</a> que cancelamos a inscrição manualmente.</p>`);
    return;
  }

  const alvo = escapeHtml(email);
  const base = escapeHtml(unsubscribeUrl(email));
  const loja = escapeHtml(siteOrigin());

  if (req.method === 'GET') {
    renderPage(res, 200, 'Cancelar inscricao', `<h2 style="margin:0 0 12px;font-size:19px">Cancelar inscrição</h2><p>Confirme que <strong>${alvo}</strong> não deve mais receber novidades, promoções e lembretes de carrinho.</p><form method="post" action="${base}" style="margin:22px 0 0"><button type="submit" style="${BOTAO}">Cancelar inscrição</button></form><p style="${NOTA}">Avisos dos pedidos que você já fez — confirmação, pagamento e rastreio — continuam sendo enviados.</p><p style="${NOTA}"><a href="${loja}" style="color:#a855f7">Voltar para a loja</a></p>`);
    return;
  }

  const reativar = String(req.query?.a || '') === 'on';
  try {
    // Limite largo e por IP: o token já impede descadastrar terceiros, então o
    // que resta a conter é enxurrada de escrita. Apertar mais seria pior do que
    // o abuso — recusar um cancelamento legítimo é o que faz o cliente marcar
    // a loja como spam.
    await enforceRateLimit(req, { scope: 'unsubscribe', limit: 60, windowMs: 60 * 60 * 1000 });
    await setOptOut(email, { optedOut: !reativar, source: 'email_link' });
  } catch (error) {
    console.error('[unsubscribe]', error instanceof Error ? error.message : error);
    renderPage(res, error instanceof HttpError ? error.statusCode : 500, 'Nao deu certo', `<h2 style="margin:0 0 12px;font-size:19px">Não foi possível concluir agora</h2><p>Tente de novo em alguns minutos. Se continuar, escreva para <a href="mailto:${MAIL_REPLY_TO}" style="color:#a855f7">${MAIL_REPLY_TO}</a> que resolvemos manualmente.</p>`);
    return;
  }

  if (reativar) {
    renderPage(res, 200, 'Inscricao reativada', `<h2 style="margin:0 0 12px;font-size:19px">Inscrição reativada</h2><p><strong>${alvo}</strong> volta a receber novidades e promoções.</p><p style="${NOTA}"><a href="${loja}" style="color:#a855f7">Voltar para a loja</a></p>`);
    return;
  }

  renderPage(res, 200, 'Inscricao cancelada', `<h2 style="margin:0 0 12px;font-size:19px">Pronto, inscrição cancelada</h2><p><strong>${alvo}</strong> não vai mais receber novidades, promoções nem lembretes de carrinho.</p><p style="${NOTA}">Confirmação de pedido e rastreio continuam chegando: são avisos do que você comprou, não divulgação.</p><form method="post" action="${base}&amp;a=on" style="margin:22px 0 0"><button type="submit" style="${BOTAO_SECUNDARIO}">Foi sem querer, voltar a receber</button></form><p style="${NOTA}"><a href="${loja}" style="color:#a855f7">Voltar para a loja</a></p>`);
}

export default async function handler(req, res) {
  const { action } = req.query;
  if (action === 'submission') return handleSubmission(req, res);
  if (action === 'analytics') return handleAnalytics(req, res);
  if (action === 'unsubscribe') return handleUnsubscribe(req, res);
  return res.status(400).json({ error: 'invalid_action' });
}
