import { describe, expect, it } from 'vitest';
import { handleDashboard as adminDashboard, handleCouponUsage as adminCouponUsage } from '../admin.js';
import {
  buildDashboardAnalytics,
  couponRow,
  matchesCouponFilters,
  orderRevenueYen,
} from './order-analytics.js';

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

describe('order analytics', () => {
  it('uses immutable yen snapshots and excludes cancelled orders from revenue', () => {
    const orders = [
      {
        id: 'one',
        orderNumber: 'ONE',
        orderDate: '2026-07-10T00:00:00.000Z',
        status: 'delivered',
        grandTotalYen: 1200,
        totalPrice: 20,
        currency: 'BRL',
        shippingCost: 2,
        psFeeFinalYen: 50,
        couponDiscount: 5,
        paymentMethod: 'pix',
        items: [{ productId: 'p1', productName: 'Produto', quantity: 2 }],
      },
      {
        id: 'cancelled',
        orderDate: '2026-07-11T00:00:00.000Z',
        status: 'cancelled',
        grandTotalYen: 9000,
        items: [],
      },
    ];
    const result = buildDashboardAnalytics(
      orders,
      [{ id: 'p1', name: 'Produto', cost: 100 }],
      new Date('2026-07-23T00:00:00.000Z'),
    );

    expect(orderRevenueYen(orders[0])).toBe(1200);
    expect(result.stats.totalOrders).toBe(1);
    expect(result.stats.cancelledOrders).toBe(1);
    expect(result.stats.totalRevenue).toBe(1200);
    expect(result.finance.custo).toBe(200);
    expect(result.finance.receitaPS).toBe(50);
    expect(result.topProducts).toEqual([{ name: 'Produto', count: 2 }]);
    expect(result.paymentMethods).toEqual([{ method: 'PIX', revenue: 1200 }]);
    expect(result.monthlyData.at(-1)).toMatchObject({ orders: 1, receitaComFrete: 1200 });
  });

  it('builds and filters coupon rows without leaking cancelled orders', () => {
    const row = couponRow({
      id: 'order-1',
      orderDate: '2026-07-20T00:00:00.000Z',
      couponCode: 'VERAO10',
      couponDiscount: 100,
      currency: 'JPY',
      status: 'delivered',
    });
    expect(row).toMatchObject({ id: 'order-1', couponCode: 'VERAO10', discountYen: 100 });
    expect(matchesCouponFilters(row, 'coupon', 'verao')).toBe(true);
    expect(matchesCouponFilters(row, 'affiliate', '')).toBe(false);
    expect(couponRow({ status: 'cancelled', couponCode: 'X' })).toBeNull();
  });
});

describe('admin analytics API boundaries', () => {
  it('requires admin authentication before dashboard data access', async () => {
    const res = response();
    await adminDashboard({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('requires admin authentication before coupon report access', async () => {
    const res = response();
    await adminCouponUsage({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('rejects unsupported methods before data access', async () => {
    const res = response();
    await adminDashboard({ method: 'POST', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'method_not_allowed' });
  });
});
