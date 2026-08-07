import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fulfillOrder: vi.fn(),
  markFulfillmentReview: vi.fn(),
  sendMail: vi.fn(),
  retrieveEvent: vi.fn(),
}));

// Mantém a verificação de assinatura REAL do Stripe e troca só a chamada de
// rede. Assim o teste do caminho rápido continua provando criptografia de
// verdade, e o do fallback observa a consulta à API sem sair da máquina.
vi.mock('stripe', async (importOriginal) => {
  const Real = (await importOriginal()).default;
  return {
    default: class extends Real {
      constructor(...args) {
        super(...args);
        this.events = { retrieve: mocks.retrieveEvent };
      }
    },
  };
});

vi.mock('./fulfillment.js', () => ({
  fulfillOrder: mocks.fulfillOrder,
  markFulfillmentReview: mocks.markFulfillmentReview,
}));
vi.mock('./mailer.js', () => ({
  buildOrderEmail: () => ({ subject: 'Order', html: '<p>Order</p>' }),
  sendMail: mocks.sendMail,
}));
vi.mock('./firebase-admin.js', () => ({
  adminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          id: 'SE-BR-123456',
          data: () => ({
            orderNumber: 'SE-BR-123456',
            customerEmail: 'buyer@example.com',
            currency: 'JPY',
            totalPrice: 1000,
            stripePaymentIntentId: 'pi_test',
          }),
        }),
      }),
    }),
  }),
}));

const { default: webhook } = await import('../stripe-webhook.js');

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

const previousKey = process.env.STRIPE_SECRET_KEY;
const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  mocks.fulfillOrder.mockReset().mockResolvedValue({ replay: false });
  mocks.markFulfillmentReview.mockReset().mockResolvedValue(undefined);
  mocks.sendMail.mockReset().mockResolvedValue({});
  mocks.retrieveEvent.mockReset();
});

afterEach(() => {
  if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = previousKey;
  if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
});

function eventPayload() {
  return JSON.stringify({
    id: 'evt_test',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test',
        object: 'payment_intent',
        amount_received: 1000,
        currency: 'jpy',
        metadata: { orderId: 'SE-BR-123456' },
      },
    },
  });
}

describe('Stripe webhook signature boundary', () => {
  it('recusa quando a assinatura falha e não há id de evento para conferir', async () => {
    const res = response();
    await webhook({
      method: 'POST',
      headers: { 'stripe-signature': 'invalid' },
      body: Buffer.from(JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } })),
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_stripe_signature' });
    expect(mocks.fulfillOrder).not.toHaveBeenCalled();
  });

  it('recusa id de evento malformado sem chamar a API do Stripe', async () => {
    const res = response();
    await webhook({
      method: 'POST',
      headers: { 'stripe-signature': 'invalid' },
      // `id` fora do formato evt_... nunca vira requisição de rede.
      body: Buffer.from(JSON.stringify({ id: '../../admin', type: 'payment_intent.succeeded' })),
    }, res);

    expect(res.statusCode).toBe(400);
    expect(mocks.retrieveEvent).not.toHaveBeenCalled();
    expect(mocks.fulfillOrder).not.toHaveBeenCalled();
  });

  it('com assinatura falha mas id válido, usa o evento da API e IGNORA o corpo', async () => {
    // O corpo mente: diz que o pedido é outro. Só o que a API devolver vale.
    // Passar como objeto (nao Buffer) marca autentico: false, permitindo fallback.
    const corpo = {
      id: 'evt_test123',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_falso', metadata: { orderId: 'PEDIDO-FORJADO' }, amount_received: 1, currency: 'brl' } },
    };
    mocks.retrieveEvent.mockResolvedValue(JSON.parse(eventPayload()));

    const res = response();
    await webhook({ method: 'POST', headers: { 'stripe-signature': 'invalid' }, body: corpo }, res);

    expect(mocks.retrieveEvent).toHaveBeenCalledWith('evt_test123');
    // Faturou o pedido que a API confirmou, não o que o corpo alegava.
    expect(mocks.fulfillOrder).toHaveBeenCalledWith('SE-BR-123456', expect.anything());
  });

  it('verifica o payload intacto e fatura sem consultar a API', async () => {
    const payload = eventPayload();
    const stripe = new Stripe('sk_test_placeholder');
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
    const res = response();
    await webhook({ method: 'POST', headers: { 'stripe-signature': signature }, body: Buffer.from(payload) }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, replay: false });
    expect(mocks.retrieveEvent).not.toHaveBeenCalled();   // caminho rápido, sem rede
    expect(mocks.fulfillOrder).toHaveBeenCalledWith('SE-BR-123456', {
      provider: 'stripe',
      reference: 'pi_test',
      confirmedBy: 'stripe-webhook',
    });
  });

  it('rejeita com 400 quando os bytes são autênticos e a assinatura não confere', async () => {
    // Com bytes autenticos, nao sobra outra explicacao alem de segredo errado.
    // Nao deve usar o fallback — o 400 alerta o operador que precisa verificar
    // a variavel STRIPE_WEBHOOK_SECRET. Se usasse o fallback, a falha de
    // assinatura seria silenciada para sempre.
    const payload = eventPayload();
    const corpoAutentico = Buffer.from(payload);

    // Assinatura gerada com segredo *diferente* — nao vai conferir com whsec_test
    const stripe = new Stripe('sk_test_placeholder');
    const assinaturaBrabo = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_wrong', // segredo diferente!
    });

    const res = response();
    await webhook({
      method: 'POST',
      headers: { 'stripe-signature': assinaturaBrabo },
      rawBody: corpoAutentico, // bytes autenticos!
    }, res);

    // Deve rejeitar com 400 sem chamar retrieveEvent (nao usa fallback)
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_stripe_signature' });
    expect(mocks.retrieveEvent).not.toHaveBeenCalled();
    expect(mocks.fulfillOrder).not.toHaveBeenCalled();
  });

  it('usa o fallback da API quando o corpo foi reconstruído pela plataforma', async () => {
    // Corpo como objeto, nao Buffer — sera reconstruido com JSON.stringify,
    // marcado como autentico: false. Assinatura invalida, mas id valido,
    // entao o fallback roda e processa o evento da API (que esta correto).
    const payload = eventPayload();
    const corpo = JSON.parse(payload); // Objeto, nao string/Buffer

    // Assinatura invalida (qualquer coisa serve porque vai falhar mesmo)
    const res = response();
    mocks.retrieveEvent.mockResolvedValue(JSON.parse(payload));

    await webhook({
      method: 'POST',
      headers: { 'stripe-signature': 'invalid' },
      body: corpo, // Objeto — sera reconstruido, autentico: false
    }, res);

    // Deve usar o fallback: chamar retrieveEvent com o id
    expect(mocks.retrieveEvent).toHaveBeenCalledWith('evt_test');
    // E processar normalmente o evento da API
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, replay: false });
    expect(mocks.fulfillOrder).toHaveBeenCalledWith('SE-BR-123456', expect.anything());
  });
});
