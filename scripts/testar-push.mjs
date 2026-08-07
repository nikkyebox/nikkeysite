// Envia um push REAL para cada inscrição salva em `push_subscriptions` e mostra
// o que o provedor (FCM/Mozilla/WNS) respondeu. Separa três causas que, da tela
// do admin, parecem a mesma coisa ("não apareceu nada"):
//
//   201/200 → provedor aceitou. A falha é de EXIBIÇÃO: permissão do sistema,
//             foco/silencioso do aparelho, ou o service worker de push não está
//             ativo naquele device.
//   403     → par de chaves VAPID trocado: quem assinou o envio não é o dono da
//             chave pública usada na inscrição.
//   404/410 → inscrição morta (cliente desinstalou o PWA, limpou dados ou
//             revogou a permissão). Precisa ser apagada e refeita.
//
//   node scripts/testar-push.mjs [--enviar]
//
// Sem `--enviar` só lista as inscrições, sem incomodar ninguém.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const webpush = require('web-push');

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const valor = (chave) => {
  const m = env.match(new RegExp(`^${chave}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : '';
};

const publicKey = valor('VAPID_PUBLIC_KEY');
const privateKey = valor('VAPID_PRIVATE_KEY');
const subject = valor('VAPID_SUBJECT') || 'mailto:contato@nikkeybox-store.com';
if (!publicKey || !privateKey) {
  console.error('Faltam VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no .env');
  process.exit(1);
}
webpush.setVapidDetails(subject, publicKey, privateKey);
console.log(`chave publica: ${publicKey.length} chars (final ${publicKey.slice(-8)}) | subject: ${subject}`);

const credencial = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'));
const app = initializeApp({ credential: cert(credencial) });
const db = getFirestore(app);

const snap = await db.collection('push_subscriptions').get();
console.log(`\ninscricoes em push_subscriptions: ${snap.size}`);

const enviar = process.argv.includes('--enviar');
for (const doc of snap.docs) {
  const d = doc.data();
  const endpoint = String(d.endpoint || '');
  const provedor = endpoint ? new URL(endpoint).host : '(sem endpoint)';
  const atualizado = d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : String(d.updatedAt || '-');
  console.log(`\n- ${doc.id} | ${d.customerEmail || '(sem e-mail)'} | ${provedor} | atualizado ${atualizado}`);
  console.log(`  userAgent: ${String(d.userAgent || '-').slice(0, 90)}`);
  if (!enviar) continue;
  if (!endpoint || !d.keys?.p256dh || !d.keys?.auth) {
    console.log('  SEM CHAVES — inscricao invalida, nao da para enviar');
    continue;
  }
  const payload = JSON.stringify({
    title: 'Teste de notificação',
    body: 'Se esta mensagem apareceu, o push está funcionando de ponta a ponta.',
    url: '/carrinho',
    tag: 'teste-push',
  });
  try {
    const r = await webpush.sendNotification({ endpoint, keys: d.keys }, payload);
    console.log(`  PROVEDOR ACEITOU: HTTP ${r.statusCode} → a falha, se houver, é de exibição no aparelho`);
  } catch (erro) {
    console.log(`  PROVEDOR RECUSOU: HTTP ${erro.statusCode ?? '?'} ${String(erro.body || erro.message || '').split('\n')[0].slice(0, 160)}`);
    if (erro.statusCode === 403) console.log('  → par de chaves VAPID trocado entre inscrição e envio');
    if (erro.statusCode === 404 || erro.statusCode === 410) console.log('  → inscrição morta: precisa reinscrever neste aparelho');
  }
}

await deleteApp(app);
