import { beforeEach, describe, expect, it, vi } from 'vitest';

const injected = vi.hoisted(() => ({ db: null }));
const mocks = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('./firebase-admin.js', () => ({ adminDb: () => injected.db }));
vi.mock('./mailer.js', async (importOriginal) => ({
  // O template real vai junto: se ele quebrar, o teste do aviso quebra também.
  // Só o envio é trocado, que é o que depende de rede.
  ...(await importOriginal()),
  sendMail: mocks.sendMail,
}));

const { fulfillOrder, markFulfillmentReview } = await import('./fulfillment.js');

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function setDotted(target, key, value) {
  const parts = key.split('.');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor[parts[index]] ||= {};
    cursor = cursor[parts[index]];
  }
  cursor[parts.at(-1)] = value;
}

class FakeDb {
  constructor(initial) {
    this.docs = new Map(Object.entries(initial).map(([path, value]) => [path, clone(value)]));
  }

  // `markFulfillmentReview` lê e escreve FORA de transação, direto no doc ref.
  // O fake precisa dos dois modos para cobrir os dois caminhos do arquivo.
  collection(name) {
    const banco = this;
    return {
      doc: (id) => {
        const ref = { path: `${name}/${id}`, id: String(id) };
        ref.get = async () => banco.snapshot(ref);
        ref.set = async (value, options) => {
          const anterior = options?.merge ? (banco.docs.get(ref.path) || {}) : {};
          banco.docs.set(ref.path, { ...clone(anterior), ...clone(value) });
        };
        return ref;
      },
    };
  }

  snapshot(ref, docs = this.docs) {
    const value = docs.get(ref.path);
    return { ref, id: ref.id, exists: value !== undefined, data: () => clone(value) };
  }

  async runTransaction(callback) {
    const working = new Map([...this.docs].map(([path, value]) => [path, clone(value)]));
    const transaction = {
      get: async (ref) => this.snapshot(ref, working),
      create: (ref, value) => {
        if (working.has(ref.path)) throw new Error('already_exists');
        working.set(ref.path, clone(value));
      },
      set: (ref, value, options) => {
        const next = options?.merge ? { ...(working.get(ref.path) || {}), ...clone(value) } : clone(value);
        working.set(ref.path, next);
      },
      update: (ref, value) => {
        if (!working.has(ref.path)) throw new Error('not_found');
        const next = clone(working.get(ref.path));
        for (const [key, fieldValue] of Object.entries(value)) setDotted(next, key, clone(fieldValue));
        working.set(ref.path, next);
      },
      delete: (ref) => working.delete(ref.path),
    };
    const result = await callback(transaction);
    this.docs = working;
    return result;
  }

  get(path) {
    return clone(this.docs.get(path));
  }
}

function order(id = 'O1', overrides = {}) {
  return {
    id,
    orderNumber: id,
    userId: `user-${id}`,
    customerEmail: `${id.toLowerCase()}@example.com`,
    customerType: 'registered',
    status: 'pending_payment',
    fulfillmentState: 'pending',
    paymentMethod: 'pix',
    items: [{ productId: 'p1', quantity: 1, unitYen: 1000, freeGift: false, homePromo: false }],
    redeemPoints: 0,
    earnedPoints: 10,
    promoPoints: 0,
    homePromoQuantity: 0,
    ...overrides,
  };
}

function database(orderValue = order(), productQuantity = 2, extras = {}) {
  return new FakeDb({
    [`orders/${orderValue.orderNumber}`]: orderValue,
    'products/p1': { name: 'Produto', stock: { unlimited: false, quantity: productQuantity }, salesCount: 0 },
    [`users/${orderValue.userId}`]: { points: 100, coupons: [] },
    ...extras,
  });
}

beforeEach(() => {
  injected.db = null;
});

describe('payment fulfillment transaction', () => {
  it('leaves a manual order and stock untouched until payment confirmation', () => {
    const db = database();
    expect(db.get('orders/O1').status).toBe('pending_payment');
    expect(db.get('products/p1').stock.quantity).toBe(2);
  });

  it('applies stock and rewards once and treats replay as a no-op', async () => {
    const db = database();
    injected.db = db;
    const first = await fulfillOrder('O1', { provider: 'manual', reference: 'pix:O1', confirmedBy: 'admin' });
    expect(first.replay).toBe(false);
    expect(db.get('products/p1').stock.quantity).toBe(1);
    expect(db.get('products/p1').salesCount).toBe(1);
    expect(db.get('users/user-O1').points).toBe(110);
    expect(db.get('orders/O1')).toMatchObject({ status: 'confirmed', fulfillmentState: 'fulfilled' });

    const second = await fulfillOrder('O1', { provider: 'manual', reference: 'pix:O1', confirmedBy: 'admin' });
    expect(second.replay).toBe(true);
    expect(db.get('products/p1').stock.quantity).toBe(1);
    expect(db.get('users/user-O1').points).toBe(110);
  });

  it('rolls back every write when stock is insufficient', async () => {
    const insufficient = order('O1', { items: [{ productId: 'p1', quantity: 3, unitYen: 1000, freeGift: false, homePromo: false }] });
    const db = database(insufficient, 2);
    injected.db = db;
    await expect(fulfillOrder('O1', { provider: 'manual', reference: 'pix:O1', confirmedBy: 'admin' })).rejects.toMatchObject({ code: 'insufficient_stock' });
    expect(db.get('products/p1').stock.quantity).toBe(2);
    expect(db.get('orders/O1').fulfillmentState).toBe('pending');
    expect(db.get('fulfillment_events/manual:pix:O1')).toBeUndefined();
  });

  it('bloqueia novo 30% na mesma transação que confirma a compra', async () => {
    const paidWith30 = order('O1', { couponDiscountYen: 300 });
    const db = database(paidWith30);
    injected.db = db;
    await fulfillOrder('O1', { provider: 'manual', reference: 'cupom30', confirmedBy: 'admin' });
    expect(db.get('cart_recovery_profiles/user-O1')).toMatchObject({
      blockedFrom30: true,
      lastDiscountPercent: 30,
    });
  });

  it('só libera o 30% quando a compra usa menos de 15%', async () => {
    const paidWith10 = order('O1', { couponDiscountYen: 100 });
    const db = database(paidWith10, 2, {
      'cart_recovery_profiles/user-O1': { blockedFrom30: true, lastDiscountPercent: 30 },
    });
    injected.db = db;
    await fulfillOrder('O1', { provider: 'manual', reference: 'cupom10', confirmedBy: 'admin' });
    expect(db.get('cart_recovery_profiles/user-O1').blockedFrom30).toBe(false);
  });

  it('desconto exatamente de 15% preserva o bloqueio', async () => {
    const paidWith15 = order('O1', { couponDiscountYen: 150 });
    const db = database(paidWith15, 2, {
      'cart_recovery_profiles/user-O1': { blockedFrom30: true, lastDiscountPercent: 30 },
    });
    injected.db = db;
    await fulfillOrder('O1', { provider: 'manual', reference: 'cupom15', confirmedBy: 'admin' });
    expect(db.get('cart_recovery_profiles/user-O1')).toMatchObject({
      blockedFrom30: true,
      lastDiscountPercent: 15,
    });
  });

  it('prevents two paid orders from exceeding a promotion cap', async () => {
    const first = order('O1', {
      cpf: '11111111111',
      homePromoQuantity: 1,
      items: [{ productId: 'p1', quantity: 1, unitYen: 500, freeGift: false, homePromo: true }],
    });
    const second = order('O2', {
      cpf: '22222222222',
      homePromoQuantity: 1,
      items: [{ productId: 'p1', quantity: 1, unitYen: 500, freeGift: false, homePromo: true }],
    });
    const db = database(first, 5, {
      'orders/O2': second,
      'users/user-O2': { points: 100, coupons: [] },
      'siteContent/homePromotion': { productId: 'p1', soldCount: 0, maxProducts: 1, nextPromo: null },
    });
    injected.db = db;
    await fulfillOrder('O1', { provider: 'manual', reference: 'first', confirmedBy: 'admin' });
    await expect(fulfillOrder('O2', { provider: 'manual', reference: 'second', confirmedBy: 'admin' })).rejects.toMatchObject({ code: 'promotion_unavailable' });
    expect(db.get('siteContent/homePromotion').soldCount).toBe(1);
    expect(db.get('products/p1').stock.quantity).toBe(4);
  });
});

// Regressão do ALTO 1 do AUDITORIA.md: o pedido era cobrado, o `fulfillOrder`
// recusava, e o estado virava `payment_review` sem avisar ninguém e sem deixar
// registrado o que estornar. O cliente descobria esperando; a loja, no
// chargeback.
describe('pedido pago que não pôde ser separado', () => {
  const cobranca = { paymentIntentId: 'pi_123', amount: 114, currency: 'BRL' };

  beforeEach(() => {
    mocks.sendMail.mockReset().mockResolvedValue({});
    process.env.ORDER_NOTIFICATION_EMAIL = 'loja@example.com';
  });

  it('deixa o pedido pronto para estorno', async () => {
    const db = database(order('O1', { totalPrice: 114, currency: 'BRL' }));
    injected.db = db;

    await markFulfillmentReview('O1', 'insufficient_stock', cobranca);

    expect(db.get('orders/O1')).toMatchObject({
      status: 'payment_review',
      fulfillmentState: 'review',
      fulfillmentError: 'insufficient_stock',
      refundPending: true,
      refundReference: 'pi_123',
      refundAmount: 114,
      refundCurrency: 'BRL',
    });
  });

  it('avisa o cliente e a loja', async () => {
    injected.db = database(order('O1', { totalPrice: 114, currency: 'BRL' }));

    const { notified } = await markFulfillmentReview('O1', 'insufficient_stock', cobranca);

    expect(notified).toBe(true);
    const destinatarios = mocks.sendMail.mock.calls.map((c) => c[0].to);
    expect(destinatarios).toEqual(['o1@example.com', 'loja@example.com']);

    // O cliente não pode receber jargão nem promessa que a loja talvez não
    // cumpra; a loja precisa do motivo exato e do caminho do estorno.
    const [aoCliente, aLoja] = mocks.sendMail.mock.calls.map((c) => c[0]);
    expect(aoCliente.subject).toContain('#O1');
    expect(aoCliente.html).not.toContain('insufficient_stock');
    expect(aLoja.subject).toContain('ACAO NECESSARIA');
    expect(aLoja.html).toContain('insufficient_stock');
    expect(aLoja.html).toContain('dashboard.stripe.com/payments/pi_123');
  });

  // O Stripe entrega evento "pelo menos uma vez". Sem trava, cada reentrega
  // mandaria outro par de e-mails sobre o mesmo pedido.
  it('não repete o aviso quando o mesmo evento chega de novo', async () => {
    injected.db = database(order('O1', { totalPrice: 114, currency: 'BRL' }));

    const primeira = await markFulfillmentReview('O1', 'insufficient_stock', cobranca);
    mocks.sendMail.mockClear();
    const segunda = await markFulfillmentReview('O1', 'insufficient_stock', cobranca);

    expect(primeira.notified).toBe(true);
    expect(segunda.notified).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  // SMTP fora do ar não pode virar 500 no webhook: o Stripe repetiria em cima
  // de um pedido que já está com problema.
  it('registra o estorno mesmo se o e-mail falhar', async () => {
    const db = database(order('O1', { totalPrice: 114, currency: 'BRL' }));
    injected.db = db;
    mocks.sendMail.mockRejectedValue(new Error('smtp fora do ar'));

    const { notified } = await markFulfillmentReview('O1', 'insufficient_stock', cobranca);

    expect(notified).toBe(false);
    expect(db.get('orders/O1')).toMatchObject({ refundPending: true, refundReference: 'pi_123' });
  });

  // Quando valor/moeda divergem, o pedido e a cobrança são coisas diferentes.
  // Vale o que saiu do cartão — é isso que precisa voltar.
  it('guarda o valor cobrado, não o valor do pedido', async () => {
    const db = database(order('O1', { totalPrice: 114, currency: 'BRL' }));
    injected.db = db;

    await markFulfillmentReview('O1', 'payment_amount_or_currency_mismatch', {
      paymentIntentId: 'pi_999', amount: 9999, currency: 'USD',
    });

    expect(db.get('orders/O1')).toMatchObject({ refundAmount: 9999, refundCurrency: 'USD' });
    // O e-mail da loja tem de anunciar o que saiu do cartão ($9999.00), nunca
    // o valor do pedido (R$ 114) — é o número que a pessoa vai estornar.
    expect(mocks.sendMail.mock.calls[1][0].html).toContain('$9999.00');
    expect(mocks.sendMail.mock.calls[1][0].html).not.toContain('114');
  });
});

// Regressão do MEDIO 3 do AUDITORIA.md: a âncora do limite de promoção era só o
// CPF, que a aduana brasileira exige mas o checkout não. Quem compra de fora do
// Brasil não preenche, então `cpf_index` e `promo_usage` nunca eram gravados
// nem consultados para esse cliente — a mesma conta repetia a promoção quantas
// vezes quisesse. A âncora agora cai para `uid_<uid>` quando não há CPF.
describe('limite de promoção sem CPF', () => {
  const CODE = 'JAPAO10';

  function pedidoPromocional(id, overrides = {}) {
    return order(id, {
      promoCode: CODE,
      homePromoQuantity: 1,
      items: [{ productId: 'p1', quantity: 1, unitYen: 500, freeGift: false, homePromo: true }],
      ...overrides,
    });
  }

  // `maxProducts: null` isola o limite por pessoa do limite global da campanha:
  // sem isso a segunda compra bateria em `promotion_unavailable` antes.
  const promocaoNoAr = {
    'siteContent/homePromotion': { productId: 'p1', soldCount: 0, maxProducts: null, nextPromo: null },
  };

  it('tranca a promoção pela conta quando o pedido não tem CPF', async () => {
    const db = database(pedidoPromocional('O1', { cpf: '' }), 5, promocaoNoAr);
    injected.db = db;
    await fulfillOrder('O1', { provider: 'manual', reference: 'sem-cpf-1', confirmedBy: 'admin' });
    expect(db.get(`promo_usage/${CODE}_uid_user-O1`)).toMatchObject({
      code: CODE,
      pessoaId: 'uid_user-O1',
      cpf: '',
      orderId: 'O1',
    });
    expect(db.get('cpf_index/uid_user-O1').productIds).toContain('p1');
  });

  it('recusa a segunda tentativa do mesmo cliente sem CPF', async () => {
    // O uso anterior está gravado sob o uid. Ancorado só no CPF, o
    // `fulfillOrder` não teria onde olhar e liberaria a promoção outra vez.
    const db = database(pedidoPromocional('O2', { cpf: '' }), 5, {
      ...promocaoNoAr,
      [`promo_usage/${CODE}_uid_user-O2`]: { code: CODE, cpf: '', pessoaId: 'uid_user-O2', orderId: 'O0' },
    });
    injected.db = db;
    await expect(fulfillOrder('O2', { provider: 'manual', reference: 'sem-cpf-2', confirmedBy: 'admin' }))
      .rejects.toMatchObject({ code: 'promotion_already_used' });
    expect(db.get('orders/O2').fulfillmentState).toBe('pending');
    expect(db.get('products/p1').stock.quantity).toBe(5);
  });

  it('continua usando o CPF como âncora quando ele existe', async () => {
    const db = database(pedidoPromocional('O1', { cpf: '12345678901' }), 5, promocaoNoAr);
    injected.db = db;
    await fulfillOrder('O1', { provider: 'manual', reference: 'com-cpf', confirmedBy: 'admin' });
    expect(db.get(`promo_usage/${CODE}_12345678901`)).toMatchObject({
      pessoaId: '12345678901',
      cpf: '12345678901',
    });
    expect(db.get('cpf_index/12345678901').productIds).toContain('p1');
    // Nenhuma chave `uid_` quando há CPF: os documentos já gravados em produção
    // continuam sendo os mesmos, sem migração.
    expect(db.get(`promo_usage/${CODE}_uid_user-O1`)).toBeUndefined();
    expect(db.get('cpf_index/uid_user-O1')).toBeUndefined();
  });

  it('limite por produto da promoção também vale sem CPF', async () => {
    const db = database(pedidoPromocional('O1', { cpf: '' }), 5, {
      ...promocaoNoAr,
      'cpf_index/uid_user-O1': { productIds: ['p1'], affiliateCodes: [] },
    });
    injected.db = db;
    await expect(fulfillOrder('O1', { provider: 'manual', reference: 'sem-cpf-limite', confirmedBy: 'admin' }))
      .rejects.toMatchObject({ code: 'promotion_limit' });
    expect(db.get('products/p1').stock.quantity).toBe(5);
  });
});

// ALTO 3 do AUDITORIA.md, parte de decisão de negócio: o guarda "cupom 1× por
// cliente" só olhava e-mail, e convidado troca de e-mail de graça. A decisão
// foi trancar por CPF — que a aduana já exige no Brasil e agora o servidor
// também (`orders.js` recusa `cpf_required`). Fora do Brasil não há documento,
// então lá o e-mail segue sendo a única âncora possível.
describe('cupom global de uso único ancorado no CPF', () => {
  const CPF = '39053344705';

  function pedidoComCupom(id, overrides = {}) {
    return order(id, { couponSource: 'global', couponCode: 'BEMVINDO', ...overrides });
  }

  const cupomAtivo = { 'coupons/BEMVINDO': { isActive: true, usedCount: 0 } };

  it('recusa o mesmo CPF mesmo com e-mail novo', async () => {
    // É o ataque exato: mesma pessoa, endereço de e-mail diferente. Ancorado
    // só em e-mail, isto passava e o cupom de uso único virava ilimitado.
    const db = database(pedidoComCupom('O2', { cpf: CPF, customerEmail: 'outro@example.com' }), 5, {
      ...cupomAtivo,
      'coupon_usage/BEMVINDO': { usedBy: ['primeiro@example.com'], usedByCpf: [CPF] },
    });
    injected.db = db;

    await expect(fulfillOrder('O2', { provider: 'manual', reference: 'cpf-repetido', confirmedBy: 'admin' }))
      .rejects.toMatchObject({ code: 'coupon_already_used' });
  });

  it('grava o CPF junto do e-mail quando o cupom é consumido', async () => {
    const db = database(pedidoComCupom('O1', { cpf: CPF }), 5, cupomAtivo);
    injected.db = db;

    await fulfillOrder('O1', { provider: 'manual', reference: 'primeiro-uso', confirmedBy: 'admin' });

    const uso = db.get('coupon_usage/BEMVINDO');
    expect(uso.usedByCpf).toEqual([CPF]);
    expect(uso.usedBy).toEqual(['o1@example.com']);
  });

  // Sem esta guarda, um pedido sem CPF gravaria '' na lista e o próximo pedido
  // sem CPF casaria com ele — o cupom morreria para o mundo inteiro fora do
  // Brasil no primeiro uso.
  it('pedido sem CPF não polui a lista de documentos', async () => {
    const db = database(pedidoComCupom('O1', { cpf: '' }), 5, cupomAtivo);
    injected.db = db;

    await fulfillOrder('O1', { provider: 'manual', reference: 'sem-documento', confirmedBy: 'admin' });

    expect(db.get('coupon_usage/BEMVINDO').usedByCpf).toEqual([]);
  });

  // O histórico gravado antes desta mudança é todo por e-mail: a âncora antiga
  // não pode parar de valer, senão todo cupom já usado voltaria a valer.
  it('continua recusando pelo e-mail, como antes', async () => {
    const db = database(pedidoComCupom('O1', { cpf: '' }), 5, {
      ...cupomAtivo,
      'coupon_usage/BEMVINDO': { usedBy: ['o1@example.com'] },
    });
    injected.db = db;

    await expect(fulfillOrder('O1', { provider: 'manual', reference: 'email-repetido', confirmedBy: 'admin' }))
      .rejects.toMatchObject({ code: 'coupon_already_used' });
  });
});
