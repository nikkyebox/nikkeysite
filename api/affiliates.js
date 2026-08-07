import { requireAdmin, requireUser } from './_lib/auth.js';
import { adminDb } from './_lib/firebase-admin.js';
import {
  assertExactKeys,
  handleCors,
  HttpError,
  normalizeEmail,
  parseJsonObject,
  requiredText,
  sendError,
} from './_lib/http.js';

function adminRequested(body) {
  if (body.admin === undefined) return false;
  if (body.admin !== true) throw new HttpError(400, 'invalid_request');
  return true;
}

function tokenEmail(user) {
  const email = String(user.email || '').trim().toLowerCase();
  if (!email) throw new HttpError(403, 'forbidden');
  return email;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function affiliateSummary(document) {
  const data = document.data() || {};
  return {
    code: document.id,
    discountPercent: numberOrZero(data.discountPercent),
    commissionPercent: numberOrZero(data.commissionPercent),
    active: data.active === true,
    expiresAt: String(data.expiresAt || ''),
    totalOrders: numberOrZero(data.totalOrders),
    totalRevenue: numberOrZero(data.totalRevenue),
    totalEarnings: numberOrZero(data.totalEarnings),
    tier: ['bronze', 'silver', 'gold'].includes(data.tier) ? data.tier : 'bronze',
    currentMonthRevenue: numberOrZero(data.currentMonthRevenue),
  };
}

function pendingSummary(document) {
  const data = document.data() || {};
  return {
    id: document.id,
    affiliateCode: String(data.affiliateCode || ''),
    netYen: numberOrZero(data.netYen),
    commissionYen: numberOrZero(data.commissionYen),
  };
}

async function listByOwner(req, user, body) {
  assertExactKeys(body, ['action', 'ownerEmail', 'admin']);
  const ownerEmail = normalizeEmail(body.ownerEmail);
  const asAdmin = adminRequested(body);
  if (asAdmin) {
    await requireAdmin(req);
  } else if (ownerEmail !== tokenEmail(user)) {
    throw new HttpError(403, 'forbidden');
  }

  const snapshot = await adminDb()
    .collection('affiliates')
    .where('ownerEmail', '==', ownerEmail)
    .get();
  return snapshot.docs.map(affiliateSummary);
}

async function listPending(req, user, body) {
  assertExactKeys(body, ['action', 'code', 'admin']);
  const code = requiredText(body.code, { max: 80 }).toUpperCase();
  const asAdmin = adminRequested(body);
  if (asAdmin) await requireAdmin(req);
  const email = asAdmin ? '' : tokenEmail(user);

  const snapshot = await adminDb()
    .collection('affiliate_pending')
    .where('affiliateCode', '==', code)
    .get();

  return snapshot.docs
    .filter((document) => {
      const data = document.data() || {};
      if (data.status !== 'pending') return false;
      if (asAdmin) return true;
      return String(data.ownerEmail || '').trim().toLowerCase() === email
        || String(data.buyerEmail || '').trim().toLowerCase() === email;
    })
    .map(pendingSummary);
}

export default async function handler(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;

  try {
    const user = await requireUser(req);
    const body = parseJsonObject(req.body);
    const action = requiredText(body.action, { max: 20 });

    if (action === 'by-owner') {
      res.status(200).json({ affiliates: await listByOwner(req, user, body) });
      return;
    }
    if (action === 'pending-by-code') {
      res.status(200).json({ pending: await listPending(req, user, body) });
      return;
    }
    throw new HttpError(400, 'invalid_request');
  } catch (error) {
    sendError(res, error);
  }
}
