import { Resend } from 'resend';
import { encodeEmail, unsubscribeToken } from './email-optout.js';
import { escapeHtml, HttpError } from './http.js';

// Remetente no domínio da loja (precisa estar verificado no Resend: SPF/DKIM).
// RESEND_FROM_EMAIL sobrescreve, ex.: 'NikkeyBox <noreply@nikkeybox.jp>'.
export const MAIL_FROM = (process.env.RESEND_FROM_EMAIL || '').trim() || 'NikkeyBox <noreply@nikkeybox.jp>';
// Respostas dos clientes vão para uma caixa real (o remetente é noreply).
export const MAIL_REPLY_TO = 'nikkeybox.jp@gmail.com';
export const BRAND = 'NikkeyBox';

let resendClient = null;
function getResend() {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

export function siteOrigin() {
  const origin = process.env.SITE_ORIGIN || 'https://nikkeybox.jp';
  return origin.replace(/\/$/, '');
}

/**
 * Link de cancelamento do proprio destinatario. Vale para sempre: e-mail e
 * lido meses depois, e um link expirado significa cliente sem saida a nao ser
 * marcar como spam — que e o pior desfecho possivel para o dominio.
 */
export function unsubscribeUrl(email) {
  return `${siteOrigin()}/api/unsubscribe?e=${encodeEmail(email)}&t=${unsubscribeToken(email)}`;
}

/**
 * `unsubscribeUrl` so e passado em e-mail de marketing. Confirmacao de pedido,
 * redefinicao de senha e verificacao de conta sao transacionais: oferecer
 * "cancelar inscricao" neles promete algo que a loja nao pode cumprir — ela
 * precisa avisar o cliente sobre o pedido dele de qualquer forma.
 */
export function wrapEmail(inner, { unsubscribeUrl: unsubscribe = '' } = {}) {
  const optOut = unsubscribe
    ? `<p style="margin:10px 0 0">Voce recebe estas mensagens porque se cadastrou na loja. <a href="${escapeHtml(unsubscribe)}" style="color:#777;text-decoration:underline">Cancelar inscricao</a> para parar de receber.</p>`
    : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:14px;overflow:hidden"><div style="background:linear-gradient(135deg,#a855f7,#f59e0b);padding:20px;text-align:center;color:#fff"><h1 style="margin:0;font-size:22px">${BRAND}</h1><p style="margin:4px 0 0;font-size:12px;opacity:.9">Importados do Japao</p></div><div style="padding:24px;color:#333;font-size:15px;line-height:1.6">${inner}</div><div style="padding:14px;text-align:center;font-size:11px;color:#777;border-top:1px solid #eee">${BRAND} · ${MAIL_REPLY_TO} · nikkeybox.jp${optOut}</div></div>`;
}

/**
 * Versão em texto puro a partir do HTML.
 *
 * Mensagem só-HTML é um dos sinais de spam mais citados pelos filtros: e-mail
 * legítimo quase sempre traz as duas partes (multipart/alternative). O domínio
 * aqui é novo e ainda sem reputação, e boa parte dos destinatários é
 * Outlook/Hotmail, que são rigorosos com remetente novo — mandar só HTML joga
 * contra sem necessidade nenhuma.
 */
function htmlParaTexto(html) {
  return String(html)
    // Preserva o destino dos links: no texto puro a URL precisa aparecer, senão
    // o cliente que lê em texto fica sem o link de confirmação.
    .replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis, '$2: $1')
    .replace(/<\/t[dh]>/gi, '  ')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((linha) => linha.trim()).join('\n')
    .trim();
}

/**
 * `unsubscribe` e a MESMA URL que vai no corpo. Passar as duas coisas do mesmo
 * lugar garante que cabecalho e rodape nunca discordem.
 *
 * Os cabecalhos RFC 2369/8058 sao o que faz o Gmail e o Outlook mostrarem o
 * botao nativo "Cancelar inscricao" ao lado do remetente — o caminho que a
 * maioria das pessoas usa em vez de rolar ate o rodape, e que os dois exigem
 * de quem envia em volume. `One-Click` promete que um POST na URL basta, sem
 * tela intermediaria: `api/unsubscribe` cumpre isso.
 */
export async function sendMail({ to, subject, html, unsubscribe = '' }) {
  const mensagem = {
    from: `${MAIL_FROM}`,
    replyTo: MAIL_REPLY_TO,
    to,
    subject,
    html,
    text: htmlParaTexto(html),
    ...(unsubscribe
      ? {
        headers: {
          'List-Unsubscribe': `<${unsubscribe}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
      : {}),
  };

  try {
    if (!process.env.RESEND_API_KEY) {
      throw new HttpError(503, 'email_service_not_configured');
    }

    const response = await getResend().emails.send(mensagem);

    if (response.error) {
      console.error('[Resend] Email error:', response.error);
      if (response.error.message?.includes('validation')) {
        throw new HttpError(400, 'email_validation_failed');
      }
      throw new HttpError(503, 'email_send_failed');
    }

    console.log(`[Resend] Email sent: ${response.data?.id} to ${to}`);
    return {
      accepted: [to],
      rejected: [],
      messageId: response.data?.id,
    };
  } catch (error) {
    console.error('[Resend] Send mail error:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(503, 'email_send_failed');
  }
}

function money(value, currency) {
  const amount = Number(value || 0);
  if (currency === 'JPY') return `¥${Math.round(amount).toLocaleString('en-US')}`;
  if (currency === 'EUR') return `€${amount.toFixed(2)}`;
  if (currency === 'USD') return `$${amount.toFixed(2)}`;
  return `R$ ${amount.toFixed(2)}`;
}

const CARRIER_LABEL = {
  yuubin: 'Japan Post – Yu-Pack',
  yamato: 'Yamato Transport',
  sagawa: 'Sagawa Express',
  eraito: 'Japan Post – e-Light',
  'kozutsumi-air': 'Japan Post – Small Packet (aéreo)',
  ems: 'EMS – Japan Post',
};
const JAPAN_POST_CARRIERS = new Set(['yuubin', 'eraito', 'kozutsumi-air', 'ems']);
const PAID_STATUSES = new Set(['confirmed', 'shipped', 'delivered']);

// Só https: `javascript:`, `data:` e http puro nunca viram atributo `src`.
function safeImageUrl(value) {
  const url = String(value || '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : '';
}

const CELL = 'border-bottom:1px solid #eee;vertical-align:top';

function itemRows(order, currency) {
  if (!Array.isArray(order.items)) return '';
  const items = order.items.slice(0, 50);
  const hasImages = items.some((item) => safeImageUrl(item.image));
  return items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const unit = Number(item.price || 0);
    const name = escapeHtml(item.productName || item.name || 'Produto');
    const image = safeImageUrl(item.image);
    const thumb = hasImages
      ? `<td width="76" style="padding:10px 12px 10px 0;${CELL}">${image ? `<img src="${escapeHtml(image)}" alt="${name}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #eee">` : ''}</td>`
      : '';
    const gift = item.freeGift === true;
    const detail = gift ? 'Brinde' : `${quantity} × ${money(unit, currency)}`;
    const lineTotal = gift ? 'Grátis' : money(unit * quantity, currency);
    return `<tr>${thumb}<td style="padding:10px 0;${CELL}"><strong style="color:#222">${name}</strong><br><span style="color:#777;font-size:13px">${detail}</span></td><td style="padding:10px 0 10px 12px;text-align:right;white-space:nowrap;${CELL}">${lineTotal}</td></tr>`;
  }).join('');
}

/**
 * A conta que o cliente vê. `displayTotals` (shared/money.js) garante
 * `subtotal − cupom − pontos + frete + taxa de serviço + imposto + taxas = total`;
 * só mostramos as linhas se a soma realmente fecha com o total gravado. Pedido
 * antigo, sem `priceBreakdown`, ou com valores que não batem, mostra só o total:
 * melhor omitir o detalhe do que exibir uma conta errada.
 */
function summaryRows(order, currency) {
  const b = order.priceBreakdown;
  const total = Number(order.totalPrice ?? order.total ?? 0);
  if (!b || typeof b !== 'object') return '';
  const n = (value) => Number(value || 0);
  const soma = n(b.subtotal) - n(b.couponDiscount) - n(b.pointsDiscount) + n(b.shipping) + n(b.psFee) + n(b.importDuty) + n(b.paymentFee);
  if (Math.abs(soma - total) > 0.01) return '';
  const pixDetalhado = n(b.pixIof) + n(b.pixBankFee) > 0;
  const linhas = [
    ['Produtos', n(b.subtotal), false],
    ['Cupom de desconto', -n(b.couponDiscount), true],
    ['Pontos utilizados', -n(b.pointsDiscount), true],
    ['Frete', n(b.shipping), false],
    ['Taxa de serviço', n(b.psFee), false],
    ['Imposto de importação', n(b.importDuty), false],
    ...(pixDetalhado
      ? [['IOF (PIX)', n(b.pixIof), false], ['Taxa bancária (PIX)', n(b.pixBankFee), false]]
      : [['Taxa de pagamento', n(b.paymentFee), false]]),
  ].filter(([label, value]) => value !== 0 || label === 'Produtos');
  return linhas.map(([label, value, desconto]) => `<tr><td style="padding:3px 0;color:#666">${label}</td><td style="padding:3px 0;text-align:right;color:${desconto ? '#16a34a' : '#666'}">${value < 0 ? '−' : ''}${money(Math.abs(value), currency)}</td></tr>`).join('');
}

function infoRow(label, value) {
  if (!value) return '';
  return `<tr><td width="110" style="width:110px;padding:5px 12px 5px 0;color:#777;white-space:nowrap;vertical-align:top;font-size:13px">${label}</td><td style="padding:5px 0;font-size:14px;color:#333">${value}</td></tr>`;
}

function deliveryLines(order) {
  const a = order.shippingAddress || {};
  const postal = a.postalCode ? (a.country === 'Japão' ? `〒${a.postalCode}` : a.postalCode) : '';
  return [
    a.name,
    [postal, a.prefecture || a.state, a.city].filter(Boolean).join(' '),
    [a.address, a.building].filter(Boolean).join(' '),
    a.country,
  ].filter(Boolean).map((line) => escapeHtml(line)).join('<br>');
}

export function buildOrderEmail(order, { tracking = false, store = false } = {}) {
  const orderNumber = escapeHtml(order.orderNumber || order.id);
  const name = escapeHtml(order.customerName || order.shippingAddress?.name || 'cliente');
  const currency = String(order.currency || 'JPY');
  const total = money(order.totalPrice ?? order.total, currency);
  const paid = order.paymentConfirmed === true || PAID_STATUSES.has(order.status);
  const metodo = order.paymentMethod === 'pix' ? 'PIX' : order.paymentMethod === 'card' ? 'Cartão' : '';
  const carrierId = String(order.shippingCarrier || order.shipping?.carrier || '');
  const carrier = CARRIER_LABEL[carrierId] || '';

  let titulo;
  let mensagem;
  let cor;
  if (tracking) {
    titulo = 'Seu pedido foi enviado';
    mensagem = 'Já está a caminho! Use o código abaixo para acompanhar a entrega.';
    cor = '#2563eb';
  } else if (store) {
    titulo = paid ? 'Novo pedido pago' : 'Novo pedido aguardando pagamento';
    mensagem = `Pedido de <strong>${name}</strong>.`;
    cor = paid ? '#16a34a' : '#d97706';
  } else if (paid) {
    titulo = 'Pagamento confirmado';
    mensagem = 'Recebemos seu pagamento e já vamos separar seu pedido. Avisaremos quando ele for enviado.';
    cor = '#16a34a';
  } else {
    titulo = 'Pedido recebido';
    mensagem = 'Recebemos seu pedido. O pagamento será confirmado antes da separação.';
    cor = '#d97706';
  }

  const codigo = String(order.trackingCode || order.trackingNumber || '').trim();
  const trackingBlock = tracking
    ? `<p style="margin:14px 0"><strong>Código de rastreamento:</strong> ${escapeHtml(codigo || 'aguardando atualização')}${codigo && JAPAN_POST_CARRIERS.has(carrierId) ? `<br><a href="https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${encodeURIComponent(codigo)}&amp;locale=ja" style="color:#7c3aed">Acompanhar no site do Japan Post</a>` : ''}</p>`
    : '';

  const resumo = summaryRows(order, currency);
  const contatoLoja = store
    ? infoRow('Cliente', escapeHtml([order.customerEmail || order.shippingAddress?.email, order.shippingAddress?.phone].filter(Boolean).join(' · ')))
      + infoRow('Referência', escapeHtml(order.paymentReference || ''))
    : '';
  const info = infoRow('Entrega', deliveryLines(order))
    + infoRow('Transportadora', escapeHtml(carrier))
    + infoRow('Pagamento', escapeHtml(metodo ? `${metodo} · ${paid ? 'confirmado' : 'aguardando confirmação'}` : ''))
    + contatoLoja;

  const subject = tracking
    ? `Pedido enviado - #${orderNumber}`
    : store ? `Novo pedido - #${orderNumber}` : `Pedido recebido - #${orderNumber}`;

  const html = wrapEmail(
    `<div style="border-left:4px solid ${cor};background:#fafafa;padding:12px 14px;border-radius:6px;margin-bottom:16px"><div style="font-size:17px;font-weight:bold;color:${cor}">${titulo}</div><div style="margin-top:4px;color:#444">${store ? mensagem : `Olá, <strong>${name}</strong>. ${mensagem}`}</div></div>`
    + trackingBlock
    + `<p style="margin:0 0 6px;color:#777;font-size:13px">Pedido <strong style="color:#222">${orderNumber}</strong></p>`
    + `<table role="presentation" style="width:100%;border-collapse:collapse">${itemRows(order, currency)}</table>`
    + `<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:10px">${resumo}<tr><td style="padding:10px 0 0;border-top:2px solid #eee;font-size:17px"><strong>Total</strong></td><td style="padding:10px 0 0;border-top:2px solid #eee;text-align:right;font-size:17px"><strong>${total}</strong></td></tr></table>`
    + `<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:18px;border-top:1px solid #eee">${info}</table>`,
  );
  return { subject, html };
}

/**
 * Motivos de falha na separação, em português, para o e-mail da loja.
 *
 * O código cru (`insufficient_stock`) vai junto entre parênteses: quem opera a
 * loja lê a frase, quem vai depurar precisa do código exato que o
 * `fulfillOrder` lançou.
 */
const MOTIVO_REVISAO = {
  insufficient_stock: 'estoque insuficiente para um ou mais itens',
  product_unavailable: 'produto saiu do catálogo',
  promotion_unavailable: 'promoção esgotada ou encerrada',
  promotion_changed: 'a promoção da home mudou de produto',
  promotion_limit: 'CPF já usou o limite da promoção',
  promotion_already_used: 'promoção já resgatada por este cliente',
  coupon_unavailable: 'cupom expirou ou atingiu o limite de uso',
  coupon_already_used: 'cupom já usado por este e-mail',
  affiliate_unavailable: 'código de afiliado desativado',
  affiliate_coupon_already_used: 'CPF já usou um cupom de afiliado',
  insufficient_points: 'saldo de pontos ficou abaixo do resgate',
  order_cancelled: 'pedido foi cancelado antes da confirmação',
  order_has_no_items: 'pedido sem itens',
  payment_reference_mismatch: 'a cobrança não bate com o PaymentIntent do pedido',
  payment_reference_reused: 'este PaymentIntent já quitou outro pedido',
  payment_amount_or_currency_mismatch: 'valor ou moeda cobrados divergem do pedido',
};

/**
 * Pedido pago que não pôde ser separado.
 *
 * O dinheiro já entrou e a mercadoria não vai sair — é o pior estado possível
 * do checkout, e até 04/08/2026 ele era silencioso dos dois lados. Por isso são
 * dois e-mails de tom bem diferente:
 *
 * - Cliente: avisa que o pedido travou e promete retorno com prazo. NÃO promete
 *   estorno automático, porque parte dos motivos (estoque parcial, cupom
 *   vencido) a loja resolve mantendo a venda — prometer devolução e depois
 *   entregar o pedido é pior do que não prometer nada.
 * - Loja: é uma ordem de serviço. Traz motivo, valor e o link direto do
 *   PaymentIntent, porque estornar pelo painel do Stripe é o caminho seguro —
 *   tem o contexto todo na tela e não depende de nenhum código nosso.
 */
export function buildPaymentReviewEmail(order, { reason = '', store = false } = {}) {
  const orderNumber = escapeHtml(order.orderNumber || order.id);
  const name = escapeHtml(order.customerName || order.shippingAddress?.name || 'cliente');
  const currency = String(order.currency || 'JPY');
  const valor = money(order.totalPrice ?? order.total, currency);
  const codigo = String(reason || 'fulfillment_failed');

  if (!store) {
    const html = wrapEmail(
      `<p>Ola, <strong>${name}</strong>.</p>`
      + `<p>Recebemos o pagamento do pedido <strong>#${orderNumber}</strong>, mas nao conseguimos concluir a separacao.</p>`
      + `<p><strong>Voce nao precisa fazer nada agora.</strong> Nossa equipe ja foi avisada e entra em contato em ate 1 dia util com a solucao — ajuste do pedido ou estorno integral de ${escapeHtml(valor)}.</p>`
      + `<p>Pedimos desculpas pelo transtorno.</p>`
      + `<p>Pedido: <strong>#${orderNumber}</strong></p>`
    );
    return { subject: `Problema com seu pedido #${orderNumber} - ja estamos resolvendo`, html };
  }

  const descricao = MOTIVO_REVISAO[codigo] || 'falha na separacao';
  const intentId = String(order.stripePaymentIntentId || order.paymentReference || '');
  const linkStripe = /^pi_[A-Za-z0-9_]+$/.test(intentId)
    ? `<p><a href="https://dashboard.stripe.com/payments/${escapeHtml(intentId)}" style="color:#a855f7"><strong>Abrir no Stripe para estornar</strong></a></p>`
    : '<p><em>Sem PaymentIntent registrado no pedido — conferir no painel do Stripe pelo e-mail do cliente.</em></p>';
  const html = wrapEmail(
    `<p style="font-size:17px"><strong>Pedido pago que nao foi separado.</strong></p>`
    + `<p>O cliente ja foi cobrado e avisado de que a loja entra em contato em ate 1 dia util.</p>`
    + `<table style="width:100%;border-collapse:collapse">`
    + `<tr><td style="padding:7px;border-bottom:1px solid #eee">Pedido</td><td style="padding:7px;text-align:right;border-bottom:1px solid #eee"><strong>#${orderNumber}</strong></td></tr>`
    + `<tr><td style="padding:7px;border-bottom:1px solid #eee">Cliente</td><td style="padding:7px;text-align:right;border-bottom:1px solid #eee">${escapeHtml(order.customerEmail || '')}</td></tr>`
    + `<tr><td style="padding:7px;border-bottom:1px solid #eee">Valor cobrado</td><td style="padding:7px;text-align:right;border-bottom:1px solid #eee"><strong>${escapeHtml(valor)}</strong></td></tr>`
    + `<tr><td style="padding:7px;border-bottom:1px solid #eee">Motivo</td><td style="padding:7px;text-align:right;border-bottom:1px solid #eee">${escapeHtml(descricao)} (<code>${escapeHtml(codigo)}</code>)</td></tr>`
    + `</table>`
    + linkStripe
  );
  return { subject: `[ACAO NECESSARIA] Pedido #${orderNumber} pago e nao separado - ${descricao}`, html };
}
