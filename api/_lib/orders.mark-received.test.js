import { beforeEach, describe, expect, it, vi } from 'vitest';

const injected = vi.hoisted(() => ({ user: null, db: null }));
vi.mock('./auth.js', () => ({
  requireUser: async () => injected.user,
  requireAdmin: async () => injected.user,
}));
vi.mock('./firebase-admin.js', () => ({ adminDb: () => injected.db }));

const { handleMarkReceived } = await import('../orders.js');

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function database(order) {
  const state = { order: structuredClone(order), updates: 0 };
  return {
    state,
    collection(name) {
      if (name !== 'orders') throw new Error('unexpected_collection');
      return {
        doc() {
          return {
            async get() {
              return { exists: Boolean(state.order), data: () => structuredClone(state.order) };
            },
            async update(value) {
              state.order = { ...state.order, ...structuredClone(value) };
              state.updates += 1;
            },
          };
        },
      };
    },
  };
}

async function call(body) {
  const res = response();
  await handleMarkReceived({ method: 'POST', headers: {}, body }, res);
  return res;
}

beforeEach(() => {
  injected.user = { uid: 'u1', email: 'u1@example.com' };
  injected.db = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('customer receipt confirmation API', () => {
  it('updates a paid order owned by uid through the Admin SDK', async () => {
    injected.db = database({
      userId: 'u1',
      customerEmail: 'u1@example.com',
      status: 'confirmed',
      paymentConfirmed: true,
    });

    const res = await call({ orderId: 'O1' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(injected.db.state.order).toMatchObject({
      status: 'delivered',
      customerConfirmedBy: 'u1@example.com',
    });
    expect(injected.db.state.updates).toBe(1);
  });

  it('accepts the authenticated email as the legacy ownership key', async () => {
    injected.db = database({
      userId: 'legacy-id',
      customerEmail: 'U1@example.com',
      status: 'shipped',
    });

    const res = await call({ orderId: 'O1' });

    expect(res.statusCode).toBe(200);
    expect(injected.db.state.order.status).toBe('delivered');
  });

  it('rejects a different customer without mutating the order', async () => {
    injected.db = database({
      userId: 'u2',
      customerEmail: 'u2@example.com',
      status: 'confirmed',
      paymentConfirmed: true,
    });

    const res = await call({ orderId: 'O1' });

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(injected.db.state.updates).toBe(0);
  });

  it('rejects an unpaid order even for its owner', async () => {
    injected.db = database({
      userId: 'u1',
      customerEmail: 'u1@example.com',
      status: 'pending_payment',
      paymentConfirmed: false,
    });

    const res = await call({ orderId: 'O1' });

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'order_not_receivable' });
    expect(injected.db.state.updates).toBe(0);
  });

  it('treats a repeated confirmation as an idempotent replay', async () => {
    injected.db = database({
      userId: 'u1',
      customerEmail: 'u1@example.com',
      status: 'delivered',
      customerConfirmedAt: '2026-08-01T00:00:00.000Z',
    });

    const res = await call({ orderId: 'O1' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadyConfirmed: true });
    expect(injected.db.state.updates).toBe(0);
  });
});
