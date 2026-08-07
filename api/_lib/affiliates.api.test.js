import { beforeEach, describe, expect, it, vi } from 'vitest';

const injected = vi.hoisted(() => ({ user: null, admin: false, db: null }));
vi.mock('./auth.js', async () => {
  const { HttpError } = await import('./http.js');
  return {
    requireUser: async () => injected.user,
    requireAdmin: async () => {
      if (!injected.admin) throw new HttpError(403, 'forbidden');
      return injected.user;
    },
  };
});
vi.mock('./firebase-admin.js', () => ({ adminDb: () => injected.db }));

const { default: affiliatesApi } = await import('../affiliates.js');

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

class Query {
  constructor(rows, filters = []) {
    this.rows = rows;
    this.filters = filters;
  }

  where(field, operator, value) {
    if (operator !== '==') throw new Error('unsupported_operator');
    return new Query(this.rows, [...this.filters, { field, value }]);
  }

  async get() {
    const docs = this.rows
      .filter((row) => this.filters.every((filter) => row.data[filter.field] === filter.value))
      .map((row) => ({ id: row.id, data: () => structuredClone(row.data) }));
    return { docs };
  }
}

function database(collections) {
  return {
    collection(name) {
      return new Query(collections[name] || []);
    },
  };
}

async function call(body) {
  const res = response();
  await affiliatesApi({ method: 'POST', headers: {}, body }, res);
  return res;
}

beforeEach(() => {
  injected.user = { uid: 'u1', email: 'owner@example.com' };
  injected.admin = false;
  injected.db = database({
    affiliates: [{
      id: 'OWNER10',
      data: {
        ownerEmail: 'owner@example.com',
        ownerName: 'Private Name',
        discountPercent: 10,
        commissionPercent: 15,
        active: true,
        expiresAt: '2030-01-01T00:00:00.000Z',
        totalOrders: 3,
        totalRevenue: 10000,
        totalEarnings: 1500,
        tier: 'silver',
        currentMonthRevenue: 5000,
        currentMonthKey: '2026-08',
      },
    }],
    affiliate_pending: [
      {
        id: 'pending-owner',
        data: {
          affiliateCode: 'OWNER10',
          status: 'pending',
          ownerEmail: 'owner@example.com',
          buyerEmail: 'buyer@example.com',
          orderId: 'private-order',
          netYen: 1000,
          commissionYen: 150,
        },
      },
      {
        id: 'confirmed-owner',
        data: {
          affiliateCode: 'OWNER10',
          status: 'confirmed',
          ownerEmail: 'owner@example.com',
          buyerEmail: 'buyer@example.com',
          netYen: 2000,
          commissionYen: 300,
        },
      },
      {
        id: 'pending-other',
        data: {
          affiliateCode: 'OWNER10',
          status: 'pending',
          ownerEmail: 'other@example.com',
          buyerEmail: 'other-buyer@example.com',
          netYen: 5000,
          commissionYen: 500,
        },
      },
    ],
  });
});

describe('affiliate owner API', () => {
  it('returns only the authenticated owner dashboard DTO', async () => {
    const res = await call({ action: 'by-owner', ownerEmail: 'owner@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body.affiliates).toHaveLength(1);
    expect(res.body.affiliates[0]).toMatchObject({ code: 'OWNER10', totalOrders: 3, tier: 'silver' });
    expect(res.body.affiliates[0]).not.toHaveProperty('ownerEmail');
    expect(res.body.affiliates[0]).not.toHaveProperty('ownerName');
  });

  it('rejects reading another owner dashboard', async () => {
    const res = await call({ action: 'by-owner', ownerEmail: 'other@example.com' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it('filters pending commissions by status and authenticated ownership', async () => {
    const res = await call({ action: 'pending-by-code', code: 'owner10' });

    expect(res.statusCode).toBe(200);
    expect(res.body.pending).toEqual([{
      id: 'pending-owner',
      affiliateCode: 'OWNER10',
      netYen: 1000,
      commissionYen: 150,
    }]);
  });

  it('requires admin authentication before returning all matching commissions', async () => {
    const denied = await call({ action: 'pending-by-code', code: 'OWNER10', admin: true });
    expect(denied.statusCode).toBe(403);

    injected.admin = true;
    const allowed = await call({ action: 'pending-by-code', code: 'OWNER10', admin: true });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body.pending.map((entry) => entry.id)).toEqual(['pending-owner', 'pending-other']);
  });
});
