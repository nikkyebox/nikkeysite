import { createHash } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, superAdminEmail } from './_lib/auth.js';
import { adminAuth, adminDb } from './_lib/firebase-admin.js';
import {
  assertExactKeys,
  handleCors,
  HttpError,
  parseJsonObject,
  requiredText,
  sendError,
} from './_lib/http.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { buildDashboardAnalytics, couponRow, matchesCouponFilters, orderEpoch } from './_lib/order-analytics.js';

// ── admin-dashboard.js ───────────────────────────────────────────────
const ORDER_FIELDS = [
  'orderDate', 'date', 'syncedAt', 'status', 'paymentMethod', 'currency',
  'grandTotalYen', 'totalYen', 'totalPrice', 'totalAmount', 'shippingCost', 'shipping',
  'psFeeFinalYen', 'couponDiscount', 'items',
];

async function handleDashboard(req, res) {
  if (!handleCors(req, res, { methods: ['GET'] })) return;

  try {
    const admin = await requireAdmin(req);
    await enforceRateLimit(req, {
      scope: 'admin-dashboard',
      limit: 60,
      windowMs: 60 * 60 * 1000,
      identity: admin.uid,
    });

    const db = adminDb();
    // Firestore has no arbitrary GROUP BY for the product/payment breakdowns. The scan
    // remains server-side and projects only fields needed by this administrative report.
    const [ordersSnapshot, productsSnapshot] = await Promise.all([
      db.collection('orders').select(...ORDER_FIELDS).get(),
      db.collection('products').select('name', 'cost').get(),
    ]);
    const orders = ordersSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    const products = productsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({ ok: true, ...buildDashboardAnalytics(orders, products) });
  } catch (error) {
    console.error('[admin-dashboard]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

// ── admin-coupon-usage.js ────────────────────────────────────────────
const DATE_FIELDS = ['orderDate', 'date', 'syncedAt'];
const MAX_SCAN_PER_SOURCE = 200;

function scalar(value) {
  return Array.isArray(value) ? value[0] : value;
}

function encodeValue(value) {
  if (value && typeof value.toMillis === 'function') {
    return { type: 'timestamp', millis: value.toMillis() };
  }
  if (typeof value === 'string') return { type: 'string', value };
  if (typeof value === 'number' && Number.isFinite(value)) return { type: 'number', value };
  throw new HttpError(400, 'invalid_cursor');
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'invalid_cursor');
  if (value.type === 'timestamp' && Number.isFinite(value.millis)) return Timestamp.fromMillis(value.millis);
  if (value.type === 'string' && typeof value.value === 'string') return value.value;
  if (value.type === 'number' && Number.isFinite(value.value)) return value.value;
  throw new HttpError(400, 'invalid_cursor');
}

function encodeCursor(positions) {
  return Buffer.from(JSON.stringify({ version: 1, positions }), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return {};
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (payload?.version !== 1 || !payload.positions || typeof payload.positions !== 'object') {
      throw new Error('shape');
    }
    const positions = {};
    for (const [field, position] of Object.entries(payload.positions)) {
      if (!DATE_FIELDS.includes(field) || !position || typeof position.id !== 'string') throw new Error('position');
      positions[field] = { value: decodeValue(position.value), id: position.id };
    }
    return positions;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'invalid_cursor');
  }
}

function queryParams(req) {
  const rawLimit = Number(scalar(req.query?.limit) ?? 25);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    throw new HttpError(400, 'invalid_request');
  }
  const type = String(scalar(req.query?.type) || 'all');
  if (!['all', 'coupon', 'affiliate'].includes(type)) throw new HttpError(400, 'invalid_request');
  const code = String(scalar(req.query?.code) || '').trim();
  if (code.length > 64) throw new HttpError(400, 'invalid_request');
  const cursor = String(scalar(req.query?.cursor) || '');
  if (cursor.length > 4096) throw new HttpError(400, 'invalid_cursor');
  return { limit: rawLimit, type, code, cursor };
}

async function handleCouponUsage(req, res) {
  if (!handleCors(req, res, { methods: ['GET'] })) return;

  try {
    const admin = await requireAdmin(req);
    await enforceRateLimit(req, {
      scope: 'admin-coupon-usage',
      limit: 120,
      windowMs: 60 * 60 * 1000,
      identity: admin.uid,
    });
    const params = queryParams(req);
    const previous = decodeCursor(params.cursor);
    const orders = adminDb().collection('orders');

    const snapshots = await Promise.all(DATE_FIELDS.map(async (field) => {
      let query = orders.orderBy(field, 'desc').orderBy(FieldPath.documentId(), 'desc');
      const position = previous[field];
      if (position) query = query.startAfter(position.value, position.id);
      const snapshot = await query.limit(MAX_SCAN_PER_SOURCE + 1).get();
      return { field, docs: snapshot.docs };
    }));

    const merged = snapshots
      .flatMap(({ field, docs }) => docs.map((document) => ({
        field,
        document,
        order: { id: document.id, ...document.data() },
      })))
      .sort((left, right) => {
        const byDate = orderEpoch(right.order) - orderEpoch(left.order);
        return byDate || right.document.id.localeCompare(left.document.id);
      });

    const positions = { ...previous };
    const rows = [];
    const seen = new Set();
    let consumed = 0;

    for (const entry of merged) {
      if (rows.length >= params.limit && !seen.has(entry.document.id)) break;
      positions[entry.field] = {
        value: entry.document.get(entry.field),
        id: entry.document.id,
      };
      consumed += 1;
      if (seen.has(entry.document.id)) continue;
      seen.add(entry.document.id);
      const row = couponRow(entry.order);
      if (matchesCouponFilters(row, params.type, params.code)) rows.push(row);
    }

    const hasMore = consumed < merged.length
      || snapshots.some(({ docs }) => docs.length > MAX_SCAN_PER_SOURCE);
    const serializedPositions = Object.fromEntries(
      Object.entries(positions).map(([field, position]) => [field, {
        value: encodeValue(position.value),
        id: position.id,
      }]),
    );

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({
      ok: true,
      items: rows,
      hasMore,
      nextCursor: hasMore ? encodeCursor(serializedPositions) : null,
      scope: 'loaded',
    });
  } catch (error) {
    console.error('[admin-coupon-usage]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

// ── admin-session.js ─────────────────────────────────────────────────
// Autentica exclusivamente SUB-ADMINS (username + senha, migrados para conta
// Firebase Auth real). O super-admin (o e-mail de `ADMIN_EMAIL`) autentica direto
// no Identity Toolkit a partir do client (src/services/adminService.ts) —
// sem depender desta função serverless, então login continua funcionando
// mesmo sem `vercel dev`/API local.

function slug(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Até 04/08/2026 existia aqui um `passwordMatches` que comparava SHA-256 dos
// dois lados — o que só funciona se `admins/{username}.password` guardar a
// senha em CLARO. Junto vinha `migrateLegacyAdmin`, que lia esse campo para
// criar a conta no Firebase Auth na primeira vez que o admin logasse.
//
// Os dois foram removidos. A coleção `admins` está vazia (conferida em
// 04/08/2026) e `createAdmin` nunca gravou `password`: ela cria a conta no
// Firebase Auth e guarda só `authEmail`. Ou seja, o caminho já era morto —
// mantê-lo só deixava de pé um leitor de senha em claro esperando alguém
// restaurar um backup antigo por cima.

function firebaseApiKey() {
  const key = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!key) throw new HttpError(503, 'admin_auth_not_configured');
  return key;
}

async function passwordSignIn(email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseApiKey())}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!response.ok) throw new HttpError(401, 'invalid_credentials');
  const payload = await response.json();
  if (!payload.localId) throw new HttpError(401, 'invalid_credentials');
  return payload.localId;
}

function adminUid(username) {
  return `admin_${createHash('sha256').update(username).digest('hex').slice(0, 24)}`;
}

// `adminEmail` foi removida junto com a migração legada: era byte a byte igual
// a `authEmail` (mais abaixo), a única que sobrou.

async function migratedAdmin(username, password) {
  const db = adminDb();
  const query = await db.collection('admins').where('username', '==', username).limit(1).get();
  if (query.empty) return null;
  const document = query.docs[0];
  const data = document.data();
  if (data.active !== true || !data.authEmail) throw new HttpError(401, 'invalid_credentials');
  const uid = await passwordSignIn(data.authEmail, password);
  if (uid !== document.id) throw new HttpError(401, 'invalid_credentials');
  return { uid, username, name: data.name || username, role: Number(data.role) || 1 };
}

async function authenticate(identifier, password) {
  return await migratedAdmin(slug(identifier), password);
}

async function handleSession(req, res) {
  if (!handleCors(req, res, { methods: ['POST'] })) return;
  try {
    await enforceRateLimit(req, {
      scope: 'admin-session',
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    const body = parseJsonObject(req.body);
    assertExactKeys(body, ['identifier', 'password']);
    const identifier = requiredText(body.identifier, { max: 254 });
    const password = requiredText(body.password, { max: 256 });
    const admin = await authenticate(identifier, password);
    if (!admin) throw new HttpError(401, 'invalid_credentials');
    const customToken = await adminAuth().createCustomToken(admin.uid, {
      admin: true,
      role: 'admin',
      adminRole: admin.role,
    });
    res.status(200).json({
      ok: true,
      customToken,
      admin: { username: admin.username, name: admin.name, role: admin.role },
    });
  } catch (error) {
    console.error('[admin-session]', error instanceof Error ? error.message : error);
    sendError(res, error instanceof HttpError ? error : new HttpError(401, 'invalid_credentials'));
  }
}

// ── admin-users.js ───────────────────────────────────────────────────
function authEmail(username) {
  const id = createHash('sha256').update(username).digest('hex').slice(0, 32);
  return `admin-${id}@auth.nikkeybox-store.com`;
}

async function effectiveRole(user) {
  if (Number(user.adminRole) === 3) return 3;
  const email = String(user.email || '').toLowerCase();
  const superEmail = superAdminEmail().toLowerCase();
  if (email && email === superEmail) return 3;
  const snap = await adminDb().collection('admins').doc(user.uid).get();
  return snap.exists && snap.data()?.active === true ? Number(snap.data()?.role) || 0 : 0;
}

async function requireManager(req) {
  const user = await requireAdmin(req);
  if (await effectiveRole(user) < 3) throw new HttpError(403, 'forbidden');
  return user;
}

async function listAdmins() {
  const snap = await adminDb().collection('admins').get();
  return snap.docs
    .map((document) => {
      const data = document.data() || {};
      return {
        username: data.username || document.id,
        name: data.name || data.username || document.id,
        role: Math.max(1, Math.min(3, Math.floor(Number(data.role) || 1))),
        addedAt: data.addedAt || '',
        addedBy: data.addedBy || '',
      };
    })
    .sort((left, right) => right.role - left.role || left.name.localeCompare(right.name));
}

async function createAdmin(body, manager) {
  assertExactKeys(body, ['name', 'password', 'role', 'addedBy']);
  const name = requiredText(body.name, { max: 120 });
  const username = slug(name);
  const password = requiredText(body.password, { max: 256 });
  if (password.length < 8) throw new HttpError(400, 'weak_password');
  const role = Math.floor(Number(body.role));
  if (![1, 2, 3].includes(role)) throw new HttpError(400, 'invalid_role');

  const db = adminDb();
  const existing = await db.collection('admins').where('username', '==', username).limit(1).get();
  const legacy = await db.collection('admins').doc(username).get();
  if (!existing.empty || legacy.exists) throw new HttpError(409, 'admin_exists');

  const uid = adminUid(username);
  const email = authEmail(username);
  const auth = adminAuth();
  await auth.createUser({ uid, email, password, displayName: name });
  try {
    await auth.setCustomUserClaims(uid, { admin: true, role: 'admin', adminRole: role });
    await db.collection('admins').doc(uid).create({
      username,
      name,
      role,
      active: true,
      authEmail: email,
      addedAt: new Date().toISOString(),
      addedBy: requiredText(body.addedBy || manager.email || manager.uid, { max: 254 }),
    });
  } catch (error) {
    await auth.deleteUser(uid).catch(() => undefined);
    throw error;
  }
  return { username, name, role };
}

async function removeAdmin(body, manager) {
  assertExactKeys(body, ['username']);
  const username = slug(requiredText(body.username, { max: 254 }));
  const db = adminDb();
  let snap = await db.collection('admins').where('username', '==', username).limit(1).get();
  let document = snap.empty ? null : snap.docs[0];
  if (!document) {
    const legacy = await db.collection('admins').doc(username).get();
    if (legacy.exists) document = legacy;
  }
  if (!document) throw new HttpError(404, 'admin_not_found');
  if (document.id === manager.uid) throw new HttpError(409, 'cannot_remove_self');

  const data = document.data() || {};
  if (String(data.username || document.id).toLowerCase() === superAdminEmail().toLowerCase()) {
    throw new HttpError(403, 'cannot_remove_super_admin');
  }
  if (document.id.startsWith('admin_')) {
    await adminAuth().revokeRefreshTokens(document.id).catch(() => undefined);
    await adminAuth().deleteUser(document.id).catch((error) => {
      if (error?.code !== 'auth/user-not-found') throw error;
    });
  }
  await document.ref.delete();
}

async function handleUsers(req, res) {
  if (!handleCors(req, res, { methods: ['GET', 'POST', 'DELETE'] })) return;
  try {
    const manager = await requireManager(req);
    await enforceRateLimit(req, {
      scope: `admin-users:${req.method}`,
      limit: req.method === 'GET' ? 120 : 20,
      windowMs: 60 * 60 * 1000,
      identity: manager.uid,
    });

    if (req.method === 'GET') {
      res.status(200).json({ ok: true, admins: await listAdmins() });
      return;
    }
    const body = parseJsonObject(req.body);
    if (req.method === 'POST') {
      res.status(201).json({ ok: true, admin: await createAdmin(body, manager) });
      return;
    }
    await removeAdmin(body, manager);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[admin-users]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

// ── admin-customer-verification.js ──────────────────────────────────
// O Firestore (de onde vem a lista de clientes) NÃO guarda o flag
// emailVerified — ele vive só no Firebase Auth. Sem este endpoint o painel
// não consegue saber quem confirmou o e-mail, e cadastros iniciados mas não
// concluídos aparecem iguais a clientes reais. Devolve um mapa email→status
// para o front cruzar com a lista de clientes.
const MAX_AUTH_PAGES = 20; // 20 × 1000 = 20.000 usuários (teto generoso)

async function handleCustomerVerification(req, res) {
  if (!handleCors(req, res, { methods: ['GET'] })) return;
  try {
    const adminUser = await requireAdmin(req);
    await enforceRateLimit(req, {
      scope: 'admin-customer-verification:GET',
      limit: 60,
      windowMs: 60 * 60 * 1000,
      identity: adminUser.uid,
    });

    const users = {};
    let pageToken;
    let pages = 0;
    do {
      const result = await adminAuth().listUsers(1000, pageToken);
      for (const record of result.users) {
        if (!record.email) continue;
        users[record.email.toLowerCase()] = {
          verified: !!record.emailVerified,
          createdAt: record.metadata?.creationTime || null,
          lastSignIn: record.metadata?.lastSignInTime || null,
        };
      }
      pageToken = result.pageToken;
    } while (pageToken && ++pages < MAX_AUTH_PAGES);

    res.status(200).json({ ok: true, users, truncated: Boolean(pageToken) });
  } catch (error) {
    console.error('[admin-customer-verification]', error instanceof Error ? error.message : error);
    sendError(res, error);
  }
}

// ── dispatcher ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { action } = req.query;
  if (action === 'dashboard') return handleDashboard(req, res);
  if (action === 'coupon-usage') return handleCouponUsage(req, res);
  if (action === 'session') return handleSession(req, res);
  if (action === 'users') return handleUsers(req, res);
  if (action === 'customers-verification') return handleCustomerVerification(req, res);
  return res.status(400).json({ error: 'invalid_action' });
}

export { handleDashboard, handleCouponUsage, handleSession, handleUsers, handleCustomerVerification };
