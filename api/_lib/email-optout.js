import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { adminDb } from './firebase-admin.js';
import { HttpError, normalizeEmail } from './http.js';

const COLLECTION = 'email_optout';

/**
 * Chave que assina os links de cancelamento.
 *
 * `UNSUBSCRIBE_SECRET` e o nome preferido. O fallback para `CRON_SECRET` existe
 * porque ele JA esta configurado em producao — sem ele o cron de recuperacao de
 * carrinho nem roda, e e justamente esse cron que mais dispara e-mail de
 * marketing. Assim o link nasce funcionando sem depender de uma variavel nova.
 *
 * O segredo nunca viaja no link: o que vai na URL e o digest, que nao volta.
 */
function signingKey() {
  const value = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET;
  if (!value) throw new HttpError(503, 'unsubscribe_not_configured');
  return value;
}

/**
 * ID do documento de opt-out: SHA-256 do e-mail normalizado.
 *
 * A colecao `newsletter` troca os caracteres proibidos por `_`, o que faz
 * `a.b@x.com` e `a#b@x.com` caírem no MESMO documento. Numa lista de leads isso
 * e um detalhe; aqui seria um cliente cancelando a inscricao de outro.
 */
export function optOutId(email) {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

export function unsubscribeToken(email) {
  return createHmac('sha256', signingKey())
    .update(`unsubscribe:${normalizeEmail(email)}`)
    .digest('base64url');
}

/** Comparacao em tempo constante — o erro nunca revela onde o token divergiu. */
export function verifyUnsubscribeToken(email, token) {
  if (typeof token !== 'string' || !token) return false;
  const expected = Buffer.from(unsubscribeToken(email), 'utf8');
  const received = Buffer.from(token, 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * O endereco viaja em base64url, e nao percent-encoded, porque parte dos
 * clientes de e-mail e dos scanners corporativos reescreve `%2B` como espaco.
 * Todo `cliente+tag@gmail.com` chegaria aqui com o endereco errado: ninguem
 * seria descadastrado e quem clicou veria "link invalido".
 */
export function encodeEmail(email) {
  return Buffer.from(normalizeEmail(email), 'utf8').toString('base64url');
}

export function decodeEmail(value) {
  if (typeof value !== 'string' || !value || value.length > 400) {
    throw new HttpError(400, 'invalid_request');
  }
  return normalizeEmail(Buffer.from(value, 'base64url').toString('utf8'));
}

export async function setOptOut(email, { optedOut, source }) {
  const address = normalizeEmail(email);
  await adminDb().collection(COLLECTION).doc(optOutId(address)).set({
    email: address,
    optedOut,
    source,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function isOptedOut(email) {
  const snap = await adminDb().collection(COLLECTION).doc(optOutId(email)).get();
  return snap.data()?.optedOut === true;
}

/**
 * Enderecos que cancelaram, resolvidos em UMA rodada de leitura.
 *
 * Uma campanha vai a ate 500 destinatarios; 500 `get()` em serie sao 500 idas
 * ao Firestore e alguns minutos de funcao serverless. `getAll` cobra as mesmas
 * leituras numa chamada so.
 */
export async function optedOutAmong(emails) {
  const unique = [...new Set(emails.map((email) => normalizeEmail(email)))];
  if (unique.length === 0) return new Set();
  const db = adminDb();
  const snaps = await db.getAll(...unique.map((email) => db.collection(COLLECTION).doc(optOutId(email))));
  return new Set(snaps.filter((snap) => snap.data()?.optedOut === true).map((snap) => snap.data().email));
}
