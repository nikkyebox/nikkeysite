const FALLBACK_YEN_PER_UNIT = Object.freeze({
  BRL: 28 / 1.04,
  EUR: 175 / 1.04,
  USD: 150 / 1.04,
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function orderEpoch(order) {
  const value = order?.orderDate ?? order?.date ?? order?.syncedAt ?? order?.createdAt;
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value && typeof value.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function orderDateCursorValue(order) {
  const value = order?.orderDate;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return '';
}

export function toYen(amount, currency) {
  const value = number(amount);
  if (!value) return 0;
  const code = String(currency || 'JPY').toUpperCase();
  const rate = FALLBACK_YEN_PER_UNIT[code];
  return Math.round(rate ? value * rate : value);
}

export function orderRevenueYen(order) {
  return number(order?.grandTotalYen)
    || toYen(number(order?.totalPrice ?? order?.totalAmount), order?.currency);
}

function orderShippingYen(order) {
  const shipping = number(order?.shippingCost ?? order?.shipping?.cost);
  const localTotal = number(order?.totalPrice ?? order?.totalAmount);
  const grandTotalYen = number(order?.grandTotalYen);
  if (grandTotalYen > 0 && localTotal > 0) return Math.round(shipping * (grandTotalYen / localTotal));
  return toYen(shipping, order?.currency);
}

function orderDiscountYen(order) {
  const discount = number(order?.couponDiscount);
  if (!discount) return 0;
  const currency = String(order?.currency || 'BRL').toUpperCase();
  const localTotal = number(order?.totalPrice ?? order?.totalAmount);
  const grandTotalYen = number(order?.grandTotalYen);
  if (currency === 'JPY') return Math.round(discount);
  if (grandTotalYen > 0 && localTotal > 0) return Math.round(discount * (grandTotalYen / localTotal));
  return toYen(discount, currency);
}

function productCostLookup(products) {
  const result = new Map();
  for (const product of products) {
    const cost = number(product?.cost);
    if (product?.id) result.set(String(product.id), cost);
    if (product?.name) result.set(String(product.name), cost);
  }
  return result;
}

function orderCostYen(order, costs) {
  return Array.isArray(order?.items)
    ? order.items.reduce((sum, item) => {
        const snapshotCost = item?.cost;
        const fallback = costs.get(String(item?.productId || ''))
          ?? costs.get(String(item?.productName || item?.name || ''))
          ?? 0;
        return sum + number(snapshotCost ?? fallback) * Math.max(1, number(item?.quantity) || 1);
      }, 0)
    : 0;
}

function monthStartUtc(date, offset = 0) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1);
}

function monthLabel(epoch) {
  return new Date(epoch).toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildDashboardAnalytics(orders, products = [], now = new Date()) {
  const costs = productCostLookup(products);
  const active = orders.filter((order) => order?.status !== 'cancelled');
  const thisMonth = monthStartUtc(now);
  const lastMonth = monthStartUtc(now, -1);
  const nextMonth = monthStartUtc(now, 1);
  const inRange = (order, from, to) => {
    const epoch = orderEpoch(order);
    return epoch >= from && epoch < to;
  };

  let receitaComFrete = 0;
  let receitaSemFrete = 0;
  let receitaPS = 0;
  let custo = 0;
  let descontosCupomYen = 0;
  const productCount = new Map();
  const paymentRevenue = new Map();

  for (const order of active) {
    const revenue = orderRevenueYen(order);
    const withoutShipping = Math.max(revenue - orderShippingYen(order), 0);
    receitaComFrete += revenue;
    receitaSemFrete += withoutShipping;
    receitaPS += number(order?.psFeeFinalYen);
    custo += orderCostYen(order, costs);
    descontosCupomYen += orderDiscountYen(order);

    for (const item of Array.isArray(order?.items) ? order.items : []) {
      const name = String(item?.productName || item?.name || 'Produto');
      productCount.set(name, (productCount.get(name) || 0) + Math.max(1, number(item?.quantity) || 1));
    }

    const method = order?.paymentMethod === 'paypay' ? 'PayPay'
      : order?.paymentMethod === 'pix' ? 'PIX'
      : order?.paymentMethod === 'wise' ? 'Wise'
      : order?.paymentMethod === 'yucho' ? 'Yucho'
      : order?.paymentMethod === 'card' ? 'Cartão'
      : 'Outro';
    paymentRevenue.set(method, (paymentRevenue.get(method) || 0) + revenue);
  }

  const receitaProduto = Math.max(receitaSemFrete - receitaPS, 0);
  const monthlyData = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    const start = monthStartUtc(now, offset);
    const end = monthStartUtc(now, offset + 1);
    const monthOrders = active.filter((order) => inRange(order, start, end));
    const withShipping = monthOrders.reduce((sum, order) => sum + orderRevenueYen(order), 0);
    const withoutShipping = monthOrders.reduce(
      (sum, order) => sum + Math.max(orderRevenueYen(order) - orderShippingYen(order), 0),
      0,
    );
    const monthCost = monthOrders.reduce((sum, order) => sum + orderCostYen(order, costs), 0);
    monthlyData.push({
      month: monthLabel(start),
      orders: monthOrders.length,
      receitaComFrete: withShipping,
      receitaSemFrete: withoutShipping,
      custo: monthCost,
      lucro: withoutShipping - monthCost,
    });
  }

  const revenueThisMonth = active
    .filter((order) => inRange(order, thisMonth, nextMonth))
    .reduce((sum, order) => sum + orderRevenueYen(order), 0);
  const revenueLastMonth = active
    .filter((order) => inRange(order, lastMonth, thisMonth))
    .reduce((sum, order) => sum + orderRevenueYen(order), 0);

  return {
    stats: {
      totalOrders: active.length,
      pendingOrders: orders.filter((order) => order?.status === 'pending').length,
      shippedOrders: orders.filter((order) => order?.status === 'shipped').length,
      deliveredOrders: orders.filter((order) => order?.status === 'delivered').length,
      cancelledOrders: orders.filter((order) => order?.status === 'cancelled').length,
      totalRevenue: receitaComFrete,
      revenueThisMonth,
      revenueLastMonth,
      ordersThisMonth: active.filter((order) => inRange(order, thisMonth, nextMonth)).length,
      ordersLastMonth: active.filter((order) => inRange(order, lastMonth, thisMonth)).length,
    },
    finance: {
      receitaComFrete,
      receitaSemFrete,
      receitaProduto,
      receitaPS,
      custo,
      lucro: receitaProduto - custo,
      descontosCupomYen,
    },
    monthlyData,
    topProducts: [...productCount.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
    paymentMethods: [...paymentRevenue.entries()].map(([method, revenue]) => ({ method, revenue })),
  };
}

export function couponRow(order) {
  const couponDiscount = number(order?.couponDiscount);
  const couponCode = String(order?.couponCode || '');
  const affiliateCode = String(order?.affiliateCode || '');
  const epoch = orderEpoch(order);
  if (order?.status === 'cancelled' || (!couponDiscount && !couponCode && !affiliateCode)) return null;
  return {
    id: String(order?.id || order?.orderNumber || ''),
    orderNumber: String(order?.orderNumber || order?.id || ''),
    orderDate: epoch ? new Date(epoch).toISOString() : '',
    customerEmail: String(order?.customerEmail || ''),
    couponCode,
    couponDiscount,
    currency: String(order?.currency || 'BRL'),
    discountYen: orderDiscountYen(order),
    grandTotalYen: number(order?.grandTotalYen),
    isAffiliate: Boolean(affiliateCode),
    affiliateCode,
  };
}

export function matchesCouponFilters(row, type = 'all', code = '') {
  if (!row) return false;
  if (type === 'coupon' && row.isAffiliate) return false;
  if (type === 'affiliate' && !row.isAffiliate) return false;
  const needle = String(code).trim().toLowerCase();
  return !needle
    || row.couponCode.toLowerCase().includes(needle)
    || row.affiliateCode.toLowerCase().includes(needle);
}
