// Limpa o feed de notificações que aparece no app (aba Perfil) e desativa as
// campanhas, para que links já enviados parem de valer.
//
//   node scripts/limpar-notificacoes.mjs            → limpa o feed e desativa
//   node scripts/limpar-notificacoes.mjs --apagar    → apaga campanhas e resgates
//
// Desativar é o padrão de propósito: `active: false` bloqueia o resgate na hora
// e é reversível, enquanto apagar o documento é definitivo. `--apagar` faz o
// mesmo que `promoCampaignService.deleteAllCampaignData()` no painel.
//
// Nunca mexe em cadastro de cliente, pedido ou cupom de perfil.
import { readFileSync } from 'node:fs';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const credencial = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'));
const app = initializeApp({ credential: cert(credencial) });
const db = getFirestore(app);
const apagar = process.argv.includes('--apagar');

const usos = await db.collection('promo_usage').get();
console.log(`resgates já registrados (promo_usage): ${usos.size}`);

const campanhas = await db.collection('promo_campaigns').get();
console.log(`campanhas: ${campanhas.size}`);
for (const doc of campanhas.docs) {
  const c = doc.data();
  if (apagar) {
    await doc.ref.delete();
    console.log(`  apagada  ${c.code} | ${c.badge || '-'}`);
  } else if (c.active !== false) {
    await doc.ref.update({ active: false });
    console.log(`  desativada ${c.code} | ${c.badge || '-'}`);
  } else {
    console.log(`  já inativa ${c.code}`);
  }
}

if (apagar) {
  for (const doc of usos.docs) await doc.ref.delete();
  if (usos.size) console.log(`resgates apagados: ${usos.size}`);
}

const feedRef = db.collection('siteContent').doc('promoNotifications');
const antes = (await feedRef.get()).data()?.items?.length ?? 0;
await feedRef.set({ items: [], updatedAt: Date.now() });
console.log(`\nfeed de notificações: ${antes} → 0 (o app deixa de mostrar o card)`);

await deleteApp(app);
