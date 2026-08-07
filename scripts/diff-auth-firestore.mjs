// Diagnóstico pontual: quais contas do Firebase Authentication NÃO têm
// documento em `users` (cliente invisível no painel).
//
// Só leitura. Roda com: node scripts/diff-auth-firestore.mjs
import { readFileSync } from 'node:fs';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const credencial = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'));

const app = initializeApp({ credential: cert(credencial) });

const { users } = await getAuth(app).listUsers(1000);
const snap = await getFirestore(app).collection('users').get();

console.log(`Authentication: ${users.length} contas | Firestore users: ${snap.size} documentos`);

const idsFirestore = new Set(snap.docs.map((d) => d.id));
const emailParaDoc = new Map();
for (const d of snap.docs) {
  const email = String(d.data().email || '').toLowerCase();
  if (email) emailParaDoc.set(email, d.id);
}

const orfaos = users.filter((u) => !idsFirestore.has(u.uid));
console.log(`\n=== ${orfaos.length} conta(s) SEM documento em users ===`);
for (const u of orfaos) {
  const provedores = u.providerData.map((p) => p.providerId).join('+') || '(nenhum)';
  const docMesmoEmail = emailParaDoc.get(String(u.email || '').toLowerCase());
  console.log([
    (u.email || '(sem e-mail)').padEnd(32),
    provedores.padEnd(20),
    `nome: ${u.displayName || '-'}`,
    `criado: ${u.metadata.creationTime}`,
    `ultimo login: ${u.metadata.lastSignInTime}`,
    `uid: ${u.uid}`,
    `doc com mesmo e-mail: ${docMesmoEmail || 'nenhum'}`,
  ].join(' | '));
}

const semConta = snap.docs.filter((d) => !users.some((u) => u.uid === d.id));
console.log(`\ndocumentos em users sem conta no Auth: ${semConta.length}`);
for (const d of semConta) console.log(' -', d.data().email || d.id, '| uid:', d.id);

const emails = users.map((u) => String(u.email || '').toLowerCase()).filter(Boolean);
const repetidos = emails.filter((e, i) => emails.indexOf(e) !== i);
console.log(`\ne-mails repetidos no Auth: ${repetidos.length ? [...new Set(repetidos)].join(', ') : 'nenhum'}`);

await deleteApp(app);
