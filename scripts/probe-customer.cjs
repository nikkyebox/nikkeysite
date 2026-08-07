// Read-only: mostra o estado real de um cliente no Firebase Auth + Firestore.
// Uso: node scripts/probe-customer.cjs <email>
const fs = require('fs');
const path = require('path');
const { cert, initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) { console.error('Informe o e-mail.'); process.exit(1); }

const keyPath = path.resolve(__dirname, '..', 'serviceAccountKey.json');
const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const app = initializeApp({ credential: cert(key), projectId: key.project_id });
const auth = getAuth(app);
const db = getFirestore(app);
const sep = '\n────────────────────────────────────────';

function printDoc(d) {
  const data = d.data();
  const orders = Array.isArray(data.orders) ? data.orders : [];
  console.log('  docId         :', d.id);
  console.log('  name          :', data.name || '(sem nome)');
  console.log('  phone         :', data.phone || '(sem telefone)');
  console.log('  createdAt     :', data.createdAt || '(não informado)');
  console.log('  points        :', data.points ?? 0);
  console.log('  orders        :', orders.length, 'registro(s) embutido(s)');
  console.log('  emailVerified :', '(campo NÃO existe no perfil — só no Auth)');
}

(async () => {
  let uid = null;
  try {
    const u = await auth.getUserByEmail(email);
    console.log(`FIREBASE AUTH  ${email}${sep}`);
    console.log('  uid           :', u.uid);
    console.log('  emailVerified :', u.emailVerified);
    console.log('  disabled      :', u.disabled);
    console.log('  providers     :', (u.providerData || []).map(p => p.providerId).join(', ') || '(nenhum)');
    console.log('  criadoEm      :', u.metadata.creationTime);
    console.log('  ultimoLogin   :', u.metadata.lastSignInTime);
    console.log('  > CONCLUIU REGISTRO (e-mail confirmado)? ', u.emailVerified ? 'SIM ✅' : 'NÃO ❌');
    uid = u.uid;
  } catch (e) {
    console.log(`FIREBASE AUTH  ${email}${sep}`);
    console.log('  NÃO EXISTE no Firebase Auth:', e.code || e.message);
  }

  console.log(`\nFIRESTORE users  (perfil que o painel lista)${sep}`);
  let snap = await db.collection('users').where('email', '==', email).get();
  if (snap.empty && uid) {
    const byUid = await db.collection('users').doc(uid).get();
    if (byUid.exists) { console.log('  (encontrado por uid, sem campo email)'); printDoc(byUid); }
    else console.log('  SEM perfil no Firestore → conta fantasma (só Auth, sem perfil).');
  } else if (snap.empty) {
    console.log('  SEM perfil no Firestore.');
  } else {
    snap.forEach(printDoc);
  }

  console.log(`\nPEDIDOS  (orders por customerEmail)${sep}`);
  const orders = await db.collection('orders').where('customerEmail', '==', email).get();
  if (orders.empty) console.log('  Nenhum pedido.');
  else orders.forEach(d => {
    const o = d.data();
    console.log('  -', d.id, '| status:', o.status || '?', '| total:', o.totalPrice ?? o.totalAmount ?? '?', o.currency || '', '|', (o.orderDate || o.date || '?'));
  });

  await deleteApp(app);
})().catch(async e => {
  console.error('ERRO:', e.code || e.message);
  try { await deleteApp(app); } catch {}
  process.exit(1);
});
