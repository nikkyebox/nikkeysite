import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

export const PS_FEE_WAIVER_TTL_MS = 60 * 60 * 1000;

function signingKey() {
  const value = process.env.PS_FEE_WAIVER_SECRET
    || process.env.UNSUBSCRIBE_SECRET
    || process.env.CRON_SECRET;
  if (!value) throw new HttpError(503, 'ps_fee_waiver_not_configured');
  return value;
}

function signature(payload) {
  return createHmac('sha256', signingKey()).update(`ps-fee-waiver:${payload}`).digest('base64url');
}

function sameText(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Emite uma autorização curta, vinculada ao UID e consumível uma única vez. */
export function issuePsFeeWaiver(uid, now = Date.now()) {
  if (typeof uid !== 'string' || !uid) throw new HttpError(400, 'invalid_user');
  const issuedAt = Math.floor(Number(now));
  const expiresAt = issuedAt + PS_FEE_WAIVER_TTL_MS;
  const id = randomUUID();
  const payload = Buffer.from(JSON.stringify({ v: 1, uid, id, issuedAt, expiresAt }), 'utf8').toString('base64url');
  return { token: `${payload}.${signature(payload)}`, id, expiresAt };
}

/** Token inválido, adulterado, vencido ou de outro usuário devolve null. */
export function verifyPsFeeWaiver(token, uid, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 1200) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !sameText(parts[1], signature(parts[0]))) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const current = Math.floor(Number(now));
    if (value?.v !== 1 || value.uid !== uid || typeof value.id !== 'string' || !value.id) return null;
    if (!Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt)) return null;
    if (value.issuedAt > current + 60_000 || value.expiresAt <= current) return null;
    if (value.expiresAt - value.issuedAt !== PS_FEE_WAIVER_TTL_MS) return null;
    return { id: value.id, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}
