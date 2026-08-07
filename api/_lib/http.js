const DEFAULT_ORIGINS = [
  'https://nikkeybox-store.com',
  'https://www.nikkeybox-store.com',
];

export class HttpError extends Error {
  constructor(statusCode, code, message = code) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function configuredOrigins() {
  const extra = String(process.env.ALLOWED_ORIGINS || process.env.APP_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

export function getHeader(req, name) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (key.toLowerCase() === target) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

export function handleCors(req, res, { methods = ['POST'] } = {}) {
  const origin = getHeader(req, 'origin');
  if (origin && !configuredOrigins().has(origin)) {
    res.status(403).json({ error: 'forbidden' });
    return false;
  }

  res.setHeader('Vary', 'Origin');
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: 'method_not_allowed' });
    return false;
  }
  return true;
}

export function parseJsonObject(body) {
  let value = body;
  if (typeof body === 'string') {
    try {
      value = JSON.parse(body || '{}');
    } catch {
      throw new HttpError(400, 'invalid_request');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid_request');
  }
  return value;
}

export function assertExactKeys(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new HttpError(400, 'invalid_request');
  }
}

export function requiredText(value, { max, pattern } = {}) {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request');
  const text = value.trim();
  if (!text || (max && text.length > max) || (pattern && !pattern.test(text))) {
    throw new HttpError(400, 'invalid_request');
  }
  return text;
}

export function optionalText(value, { max } = {}) {
  if (value === undefined || value === null || value === '') return '';
  return requiredText(value, { max });
}

export function normalizeEmail(value) {
  const email = requiredText(value, { max: 254 }).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, 'invalid_request');
  }
  return email;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sendError(res, error) {
  const status = error instanceof HttpError ? error.statusCode : 500;
  const code = error instanceof HttpError ? error.code : 'internal_error';
  res.status(status).json({ error: code });
}
