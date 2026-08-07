// Procura um e-mail em todas as coleções onde a loja guarda dado de cliente.
// Serve para decidir com segurança se uma conta pode ser removida.
//
//   node scripts/rastrear-email.mjs alguem@dominio.com
import { readFileSync } from 'node:fs';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const alvo = String(process.argv[2] || '').trim().toLowerCase();
if (!alvo) {
  console.error('Informe o e-mail.');
  process.exit(1);
}

const credencial = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'));
const app = initializeApp({ credential: cert(credencial) });
const db = getFirestore(app);

// coleção → campos que podem guardar o e-mail
const ONDE = {
  users: ['email'],
  orders: ['customerEmail', 'email'],
  abandoned_carts: ['userEmail', 'customerEmail'],
  newsletter: ['email'],
  email_optout: ['email'],
  coupon_usage: ['userEmail', 'email'],
  negotiations: ['userEmail'],
  affiliates: ['email', 'ownerEmail'],
  affiliate_pending: ['buyerEmail', 'ownerEmail'],
  affiliate_requests: ['email'],
  custom_requests: ['email'],
  b2b_requests: ['email'],
  video_reviews: ['userEmail'],
  push_subscriptions: ['customerEmail'],
  fraud_attempts: ['email'],
  promo_usage: ['email'],
};

let achou = 0;
for (const [colecao, campos] of Object.entries(ONDE)) {
  for (const campo of campos) {
    try {
      const snap = await db.collection(colecao).where(campo, '==', alvo).limit(5).get();
      if (!snap.empty) {
        achou += snap.size;
        console.log(`${colecao}.${campo}: ${snap.size} documento(s) → ${snap.docs.map((d) => d.id).join(', ')}`);
      }
    } catch (erro) {
      console.log(`${colecao}.${campo}: nao consultado (${erro.code || erro.message})`);
    }
  }
}

try {
  const conta = await getAuth(app).getUserByEmail(alvo);
  console.log(`\nAuthentication: existe | uid ${conta.uid} | provedores ${conta.providerData.map((p) => p.providerId).join('+') || '(nenhum)'} | criada ${conta.metadata.creationTime} | ultimo login ${conta.metadata.lastSignInTime}`);
} catch {
  console.log('\nAuthentication: nao existe');
}

console.log(achou === 0 ? '\nRESULTADO: nenhum dado de cliente atrelado a este e-mail.' : `\nRESULTADO: ${achou} documento(s) atrelados.`);

await deleteApp(app);
