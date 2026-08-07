import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertCouponEligibility } from './coupon-eligibility.js';
import { publicCoupon } from '../coupons.js';

class FakeQuery {
  constructor(db, name, filters = [], max = Infinity) {
    this.db = db;
    this.name = name;
    this.filters = filters;
    this.max = max;
  }

  where(field, operator, value) {
    if (operator !== '==') throw new Error('unsupported_operator');
    return new FakeQuery(this.db, this.name, [...this.filters, { field, value }], this.max);
  }

  limit(max) {
    return new FakeQuery(this.db, this.name, this.filters, max);
  }

  async get() {
    const prefix = `${this.name}/`;
    const docs = [];
    for (const [path, value] of Object.entries(this.db.values)) {
      if (!path.startsWith(prefix)) continue;
      if (!this.filters.every((filter) => value[filter.field] === filter.value)) continue;
      docs.push({ id: path.slice(prefix.length), data: () => structuredClone(value) });
      if (docs.length >= this.max) break;
    }
    return { docs };
  }
}

class FakeDb {
  constructor(values = {}) {
    this.values = values;
  }

  collection(name) {
    return new FakeQuery(this, name);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('coupon eligibility', () => {
  it('keeps target email lists server-only and checks the authenticated email', async () => {
    const coupon = {
      code: 'PRIVATE10',
      type: 'percent',
      discountPercent: 10,
      targetType: 'specific',
      targetEmails: ['allowed@example.com'],
    };

    await expect(assertCouponEligibility(new FakeDb(), coupon, { email: 'other@example.com', emailVerified: true }))
      .rejects.toMatchObject({ statusCode: 403, code: 'coupon_not_eligible' });
    await expect(assertCouponEligibility(new FakeDb(), coupon, { email: 'allowed@example.com', emailVerified: true }))
      .resolves.toBeUndefined();

    expect(publicCoupon('PRIVATE10', coupon)).not.toHaveProperty('targetEmails');
  });

  // Regressão do ALTO 3 do AUDITORIA.md. O checkout aceita convidado
  // (`signInAnonymously`), e aí o e-mail vem do formulário, não do token.
  // Sem esta trava bastava digitar o endereço da vítima para levar o cupom
  // nominal dela — inclusive os 10/15/30% de recuperação de carrinho, que
  // `cart-recovery.js` emite como `targetType: 'specific'`.
  it('recusa cupom nominal quando o e-mail não foi provado', async () => {
    const coupon = { targetType: 'specific', targetEmails: ['vitima@example.com'] };

    // Convidado digitando o endereço certo da vítima: e-mail bate, identidade não.
    await expect(assertCouponEligibility(new FakeDb(), coupon, { email: 'vitima@example.com' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'coupon_not_eligible' });
    // Conta registrada que nunca verificou o e-mail cai no mesmo lugar: dá para
    // se cadastrar com o endereço de outra pessoa sem abrir a caixa dela.
    await expect(assertCouponEligibility(new FakeDb(), coupon, { email: 'vitima@example.com', emailVerified: false }))
      .rejects.toMatchObject({ statusCode: 403, code: 'coupon_not_eligible' });
  });

  it('não deixa herdar fidelidade digitando o e-mail de um cliente antigo', async () => {
    const db = new FakeDb({
      'orders/O1': { userId: 'antigo', customerEmail: 'antigo@example.com', paymentConfirmed: true },
      'orders/O2': { userId: 'antigo', customerEmail: 'antigo@example.com', paymentConfirmed: true },
    });
    const coupon = { targetType: 'loyalty', minOrders: 2 };

    // Convidado (uid sem histórico) digitando o e-mail de quem tem histórico.
    await expect(assertCouponEligibility(db, coupon, { uid: 'convidado', email: 'antigo@example.com' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'coupon_not_eligible' });

    // O dono, com o e-mail provado, continua passando.
    await expect(assertCouponEligibility(db, coupon, { uid: 'antigo', email: 'antigo@example.com', emailVerified: true }))
      .resolves.toBeUndefined();
  });

  // O histórico do próprio uid veio do login, então vale mesmo sem e-mail
  // verificado — senão a trava puniria cliente real com pedido antigo.
  it('mantém a fidelidade pelo histórico do próprio uid', async () => {
    const db = new FakeDb({
      'orders/O1': { userId: 'u1', customerEmail: 'u@example.com', paymentConfirmed: true },
    });

    await expect(assertCouponEligibility(
      db,
      { targetType: 'loyalty', minOrders: 1 },
      { uid: 'u1', email: 'u@example.com', emailVerified: false },
    )).resolves.toBeUndefined();
  });

  it('fails closed for an unknown targeting mode', async () => {
    await expect(assertCouponEligibility(new FakeDb(), { targetType: 'email' }, { email: 'a@example.com' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'coupon_not_eligible' });
  });

  it('uses the Tokyo calendar for birthday coupons', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-31T15:30:00.000Z'));

    await expect(assertCouponEligibility(
      new FakeDb(),
      { targetType: 'birthday' },
      { userDoc: { birthdate: '1990-02-10' } },
    )).resolves.toBeUndefined();
    await expect(assertCouponEligibility(
      new FakeDb(),
      { targetType: 'birthday' },
      { userDoc: { birthdate: '1990-01-10' } },
    )).rejects.toMatchObject({ code: 'coupon_not_eligible' });
  });

  it('counts only paid orders for loyalty targeting', async () => {
    const db = new FakeDb({
      'orders/O1': { userId: 'u1', customerEmail: 'u@example.com', paymentConfirmed: true },
      'orders/O2': { userId: 'u1', customerEmail: 'u@example.com', status: 'pending_payment' },
    });

    await expect(assertCouponEligibility(
      db,
      { targetType: 'loyalty', minOrders: 2 },
      { uid: 'u1', email: 'u@example.com' },
    )).rejects.toMatchObject({ code: 'coupon_not_eligible' });
    await expect(assertCouponEligibility(
      db,
      { targetType: 'loyalty', minOrders: 1 },
      { uid: 'u1', email: 'u@example.com' },
    )).resolves.toBeUndefined();
  });

  it('enforces the minimum merchandise subtotal', async () => {
    await expect(assertCouponEligibility(
      new FakeDb(),
      { targetType: 'all', minOrderValue: 5000 },
      { productSubtotalYen: 4999 },
    )).rejects.toMatchObject({ statusCode: 409, code: 'coupon_minimum_not_met' });
  });
});
