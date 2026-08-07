// Cria o documento em `users` de contas do Authentication que ficaram sem
// cadastro por causa do bug do login social (corrigido em 6306265): o app
// autenticava no provedor e nunca gravava o perfil.
//
// Idempotente: não toca em quem já tem documento. Passe os UIDs como argumento.
//
//   node scripts/recuperar-cliente-social.mjs <uid> [<uid> ...]
//
// O perfil criado é o MESMO que `hydrateSessionFromFirebaseUser` cria hoje:
// id, name, email, phone, address vazio, createdAt (a data real da conta no
// Auth) e o cupom BEMVINDO10.
import { readFileSync } from 'node:fs';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const uids = process.argv.slice(2);
if (uids.length === 0) {
  console.error('Informe pelo menos um uid.');
  process.exit(1);
}

const credencial = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'));
const app = initializeApp({ credential: cert(credencial) });
const auth = getAuth(app);
const db = getFirestore(app);

const DIAS_CUPOM = 90;

function cupomBoasVindas(agora) {
  return {
    id: `welcome-${agora.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    code: 'BEMVINDO10',
    description: 'Cupom de boas-vindas — 10% de desconto',
    discount: 10,
    discountType: 'percentage',
    expiresAt: new Date(agora.getTime() + DIAS_CUPOM * 24 * 60 * 60 * 1000).toISOString(),
    isUsed: false,
  };
}

for (const uid of uids) {
  const ref = db.collection('users').doc(uid);
  const atual = await ref.get();
  if (atual.exists) {
    console.log(`- ${uid}: já tem documento (${atual.data().email}) — nada a fazer`);
    continue;
  }

  const conta = await auth.getUser(uid);
  const email = String(conta.email || '').trim().toLowerCase();
  const agora = new Date();
  const perfil = {
    id: uid,
    name: conta.displayName || (email ? email.split('@')[0] : 'Cliente'),
    email,
    phone: conta.phoneNumber || '',
    address: { postalCode: '', prefecture: '', city: '', address: '' },
    createdAt: new Date(conta.metadata.creationTime).toISOString(),
    coupons: [cupomBoasVindas(agora)],
    lastSyncAt: agora.toISOString(),
  };

  await ref.set(perfil);
  console.log(`+ ${uid}: cadastro criado para ${perfil.name} <${perfil.email}> com ${perfil.coupons[0].code}`);
}

await deleteApp(app);
