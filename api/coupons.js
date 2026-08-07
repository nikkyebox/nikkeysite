import { requireUser } from './_lib/auth.js';
import { activeByDate, assertCouponEligibility } from './_lib/coupon-eligibility.js';
import { adminDb } from './_lib/firebase-admin.js';
import {
  assertExactKeys,
  getHeader,
  handleCors,
  HttpError,
  parseJsonObject,
  requiredText,
  sendError,
} from './_lib/http.js';

async function optionalUser(req) {
  const authorization = String(getHeader(req, 'authorization') || '');
  return authorization ? requireUser(req) : null;
}

function numberField(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publicCoupon(code, coupon) {
  const type = coupon.type === 'fixed' ? 'fixed' : 'percent';
  const discount = Math.max(0, numberField(coupon.discount));
  const discountPercent = Math.max(0, Math.min(100, numberField(coupon.discountPercent, discount)));
  return {
    code,
    type,
    discount,
    discountPercent,
    description: typeof coupon.description === 'string' ? coupon.description.slice(0, 300) : '',
    expiryDate: typeof coupon.expiryDate === 'string' ? coupon.expiryDate : '',
    freeShipping: coupon.freeShipping === true,
    minOrderValue: Math.max(0, numberField(coupon.minOrderValue)),
  };
}

export default async function handler(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;

  try {
    const body = parseJsonObject(req.body);
    assertExactKeys(body, ['code', 'orderTotalYen']);
    const code = requiredText(body.code, { max: 80, pattern: /^[A-Za-z0-9_-]+$/ }).toUpperCase();
    const orderTotalYen = body.orderTotalYen === undefined ? 0 : Number(body.orderTotalYen);
    if (!Number.isFinite(orderTotalYen) || orderTotalYen < 0 || orderTotalYen > 1_000_000_000) {
      throw new HttpError(400, 'invalid_order_total');
    }

    const user = await optionalUser(req);
    const db = adminDb();
    const couponSnapshot = await db.collection('coupons').doc(code).get();
    if (!couponSnapshot.exists) throw new HttpError(404, 'coupon_not_found');

    const coupon = couponSnapshot.data() || {};
    if (
      coupon.isActive === false
      || !activeByDate(coupon.expiryDate)
      || (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit))
    ) {
      throw new HttpError(409, 'coupon_unavailable');
    }

    const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
    const [userSnapshot, usageSnapshot] = await Promise.all([
      user ? db.collection('users').doc(user.uid).get() : Promise.resolve(null),
      email ? db.collection('coupon_usage').doc(code).get() : Promise.resolve(null),
    ]);
    const userDoc = userSnapshot?.exists ? userSnapshot.data() : null;
    const usedBy = usageSnapshot?.exists && Array.isArray(usageSnapshot.data()?.usedBy)
      ? usageSnapshot.data().usedBy.map((entry) => String(entry).trim().toLowerCase())
      : [];
    if (email && usedBy.includes(email)) throw new HttpError(409, 'coupon_already_used');

    // Mesma régua do `orders.js`: se o pedido vai recusar por identidade não
    // provada, a tela não pode anunciar o desconto antes.
    await assertCouponEligibility(db, coupon, {
      uid: user?.uid || '',
      email,
      emailVerified: user?.email_verified === true && Boolean(user?.email),
      userDoc,
      productSubtotalYen: orderTotalYen,
    });

    res.status(200).json({ ok: true, coupon: publicCoupon(code, coupon) });
  } catch (error) {
    console.error('[coupons]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

export { publicCoupon };
