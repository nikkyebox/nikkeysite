import Stripe from 'stripe';
import { adminDb } from './_lib/firebase-admin.js';
import { fulfillOrder, markFulfillmentReview } from './_lib/fulfillment.js';
import { getHeader, HttpError, sendError } from './_lib/http.js';
import { buildOrderEmail, sendMail } from './_lib/mailer.js';

// `api.bodyParser` é convenção do Next.js. Em função avulsa na Vercel ele é
// IGNORADO: o corpo `application/json` chega já convertido em objeto, e o
// Stripe precisa dos bytes originais para conferir a assinatura. Medido em
// produção em 27/07/2026:
//   Content-Type: application/json         -> req.body vira objeto
//   Content-Type: application/octet-stream -> req.body fica cru
// Mantido porque não atrapalha e passa a valer se o projeto migrar para Next.
export const config = { api: { bodyParser: false } };

/**
 * Devolve `{ bytes, autentico }`: os bytes do corpo e se eles são os ORIGINAIS
 * que o Stripe assinou. Ordem de preferência:
 *
 * 1. `rawBody`, quando a plataforma o expõe (Buffer intacto — o ideal)
 * 2. corpo já cru, como Buffer ou string
 * 3. re-serialização do objeto parseado
 * 4. leitura do stream, se nada foi consumido
 *
 * O caso 3 é o que salva a Vercel hoje. `JSON.stringify` reproduz os bytes
 * originais porque o Stripe envia JSON compacto, sem espaços, e o JavaScript
 * preserva a ordem das chaves de string. Não é garantido pelo padrão, por isso
 * vem depois das opções que usam os bytes de verdade — e é o único caso que
 * volta com `autentico: false`, porque é uma reconstrução, não a mensagem.
 *
 * A distinção existe porque ela é a única forma de interpretar uma falha de
 * HMAC. Com bytes reconstruídos, falhar é esperado (basta um byte de diferença
 * num PaymentIntent real) e o handler confirma o evento na API do Stripe. Com
 * os bytes verdadeiros em mãos não sobra outra explicação além de segredo errado
 * ou requisição forjada — e aí cair no fallback apagaria a verificação de
 * assinatura em silêncio, para sempre, inclusive depois de rotacionar o
 * `STRIPE_WEBHOOK_SECRET` sem atualizar a variável de ambiente.
 */
async function rawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return { bytes: req.rawBody, autentico: true };
  if (typeof req.rawBody === 'string') return { bytes: Buffer.from(req.rawBody, 'utf8'), autentico: true };
  if (Buffer.isBuffer(req.body)) return { bytes: req.body, autentico: true };
  if (typeof req.body === 'string') return { bytes: Buffer.from(req.body, 'utf8'), autentico: true };
  if (req.body && typeof req.body === 'object') {
    return { bytes: Buffer.from(JSON.stringify(req.body), 'utf8'), autentico: false };
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return { bytes: Buffer.concat(chunks), autentico: true };
}

/**
 * O que o Stripe realmente cobrou, em unidade de exibição.
 *
 * A API trabalha na menor unidade da moeda (centavos), menos nas de zero
 * decimais como o iene. Guardar o número já convertido evita que o e-mail da
 * loja anuncie "R$ 11400" quando foram R$ 114.
 */
function dadosDaCobranca(intent) {
  const currency = String(intent.currency || '').toUpperCase();
  const recebido = Number(intent.amount_received ?? intent.amount ?? 0);
  return {
    paymentIntentId: String(intent.id || ''),
    amount: currency === 'JPY' ? recebido : recebido / 100,
    currency,
  };
}

async function notifyOrder(orderId) {
  const snap = await adminDb().collection('orders').doc(orderId).get();
  if (!snap.exists) return;
  const order = { id: snap.id, ...snap.data() };
  const ownerTemplate = buildOrderEmail(order);
  await sendMail({ to: order.customerEmail, ...ownerTemplate }).catch(() => undefined);
  const storeEmail = process.env.ORDER_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  if (storeEmail) {
    const storeTemplate = buildOrderEmail(order, { store: true });
    await sendMail({ to: storeEmail, ...storeTemplate }).catch(() => undefined);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !endpointSecret) {
    res.status(503).json({ error: 'stripe_webhook_not_configured' });
    return;
  }

  try {
    const signature = getHeader(req, 'stripe-signature');
    if (!signature) throw new HttpError(400, 'missing_stripe_signature');
    const stripe = new Stripe(secretKey);

    // O corpo cru é lido FORA do try da assinatura. Antes ele ficava dentro, e
    // um `raw_body_required` — que acontece quando a plataforma entrega o corpo
    // já parseado — era engolido e reportado como `invalid_stripe_signature`.
    // Os dois problemas devolvem 400, então a causa real ficava invisível e a
    // investigação ia atrás do segredo errado.
    const { bytes, autentico } = await rawBody(req);

    let event;
    try {
      event = stripe.webhooks.constructEvent(bytes, signature, endpointSecret);
    } catch (erroAssinatura) {
      // A verificação por assinatura exige os bytes EXATOS que o Stripe enviou.
      // Em função avulsa na Vercel o corpo chega já parseado, e reconstruí-lo
      // com `JSON.stringify` acerta em payloads simples mas não sobrevive a um
      // objeto real de PaymentIntent — basta um byte diferente e o HMAC muda.
      //
      // Se os bytes são AUTENTICOS (vêm direto da plataforma ou do stream) e a
      // assinatura mesmo assim falha, a causa só pode ser segredo errado ou
      // requisição forjada — não há como a reconstrução ter falhado. Nessa
      // hipótese é crítico avisar o operador, porque a verificação cai num
      // fallback que valida só na API do Stripe, deixando a assinatura
      // completamente ignorada em silêncio e para sempre (inclusive após
      // rotacionar o STRIPE_WEBHOOK_SECRET sem atualizar a env var).
      if (autentico) {
        console.error('[stripe-webhook] assinatura falhou com bytes autênticos — ' +
          'STRIPE_WEBHOOK_SECRET provavelmente está errado ou rotacionado:',
          erroAssinatura instanceof Error ? erroAssinatura.message : erroAssinatura);
        throw new HttpError(400, 'invalid_stripe_signature');
      }

      // Corpo foi reconstruído pela plataforma. Fallback para a API do Stripe,
      // que valida a assinatura pela chave secreta — mais forte que a versão
      // de HMAC em cima de bytes reconstruídos.
      const idEvento = String(JSON.parse(bytes.toString('utf8'))?.id || '');
      if (!/^evt_[A-Za-z0-9]+$/.test(idEvento)) {
        console.error('[stripe-webhook] assinatura recusada e sem id de evento:',
          erroAssinatura instanceof Error ? erroAssinatura.message : erroAssinatura);
        throw new HttpError(400, 'invalid_stripe_signature');
      }
      console.warn('[stripe-webhook] assinatura falhou (corpo reconstruído pela plataforma), ' +
        'confirmando na API:', idEvento);
      event = await stripe.events.retrieve(idEvento);
    }

    if (event.type !== 'payment_intent.succeeded') {
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const intent = event.data.object;
    const orderId = String(intent.metadata?.orderId || '');
    if (!orderId) throw new HttpError(400, 'missing_order_metadata');
    const orderSnap = await adminDb().collection('orders').doc(orderId).get();
    if (!orderSnap.exists) throw new HttpError(404, 'order_not_found');
    const order = orderSnap.data();
    const expectedAmount = order.currency === 'JPY' ? Math.round(order.totalPrice) : Math.round(order.totalPrice * 100);
    if (
      order.stripePaymentIntentId !== intent.id
      || intent.amount_received !== expectedAmount
      || String(intent.currency).toUpperCase() !== order.currency
    ) {
      // O valor vem do `intent`, não do pedido: neste ramo os dois divergem, e
      // quem vai estornar precisa saber o que saiu do cartão do cliente.
      await markFulfillmentReview(orderId, 'payment_amount_or_currency_mismatch', dadosDaCobranca(intent));
      res.status(200).json({ received: true, review: true });
      return;
    }

    try {
      const result = await fulfillOrder(orderId, {
        provider: 'stripe',
        reference: intent.id,
        confirmedBy: 'stripe-webhook',
      });
      if (!result.replay) await notifyOrder(orderId);
      res.status(200).json({ received: true, replay: result.replay });
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 409) {
        await markFulfillmentReview(orderId, error.code, dadosDaCobranca(intent));
        res.status(200).json({ received: true, review: true });
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error('[stripe-webhook]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}
