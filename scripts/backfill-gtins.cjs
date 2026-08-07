#!/usr/bin/env node
/**
 * Backfill de GTIN (JAN/EAN-13) — CommonJS, roda com `node`.
 * Lê um arquivo JSON com [{id, gtin}, ...] e grava o campo `gtin` em cada
 * produto do Firestore. Valida o checksum EAN-13 de cada código antes de
 * gravar — código inválido é descartado com aviso (nunca gravado).
 *
 * Uso (na raiz do projeto):
 *   node scripts/backfill-gtins.cjs gtins.json --dry-run   # preview, não grava
 *   node scripts/backfill-gtins.cjs gtins.json              # grava no Firestore
 *
 * O JSON de entrada é um array de objetos. Cada objeto DEVE ter `id`
 * (product id do Firestore) e `gtin` (13 dígitos). Campos extras (source,
 * note, found) são ignorados — pode vir direto da saída do lookup.
 */
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const sa = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.cert(sa) });
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!fileArg) {
  console.error('Uso: node scripts/backfill-gtins.cjs <gtins.json> [--dry-run]');
  process.exit(1);
}

const raw = require('fs').readFileSync(fileArg, 'utf8');
const entries = JSON.parse(raw);

// ── EAN-13 checksum ────────────────────────────────────────────────────────
// Posições ímpares (1ª, 3ª, … da esquerda, 1-indexadas) ×1; pares ×3; soma;
// dígito verificador = (10 − soma%10)%10. Confere contra o 13º dígito.
function ean13Ok(code) {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(code[12]);
}

(async () => {
  console.log(`${DRY_RUN ? '🔍 DRY-RUN' : '🚀 BACKFILL'} de GTINs — ${entries.length} entrada(s) no arquivo\n`);

  // Filtra: só entries com id+gtin, gtin válido no checksum, e found !== false
  const valid = [];
  const skipped = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const id = e.id;
    const gtin = e.gtin ? String(e.gtin).trim() : null;
    if (!id) { skipped.push({ e, reason: 'sem id' }); continue; }
    if (e.found === false) { skipped.push({ id, reason: 'found=false no lookup' }); continue; }
    if (!gtin) { skipped.push({ id, reason: 'sem gtin' }); continue; }
    if (!ean13Ok(gtin)) { skipped.push({ id, gtin, reason: 'checksum EAN-13 inválido' }); continue; }
    valid.push({ id, gtin });
  }

  console.log(`Válidos (serão gravados): ${valid.length}`);
  console.log(`Descartados: ${skipped.length}`);
  for (const s of skipped) {
    console.log(`  ✗ ${s.id || '(sem id)'} — ${s.reason}${s.gtin ? ` (${s.gtin})` : ''}`);
  }
  if (valid.length === 0) { console.log('\nNada a gravar.'); return; }

  console.log('\nProdutos que serão atualizados:');
  for (const v of valid) console.log(`  ✓ ${v.id}  →  ${v.gtin}`);

  if (DRY_RUN) {
    console.log('\n(dry-run — nada gravado.)');
    return;
  }

  // Verifica que o produto existe antes de gravar (evita criar docs órfãos).
  const batch = db.batch();
  let encontrados = 0;
  for (const v of valid) {
    const ref = db.collection('products').doc(v.id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  ⚠️  produto não existe no Firestore, pulando: ${v.id}`);
      continue;
    }
    batch.update(ref, { gtin: v.gtin });
    encontrados++;
  }

  if (encontrados === 0) { console.log('\nNenhum produto encontrado para gravar.'); return; }

  await batch.commit();
  console.log(`\n✅ ${encontrados} GTIN(s) gravado(s) no Firestore.`);
  console.log('   O cache de produtos (IndexedDB dos clientes) vai refletir na próxima sincronização delta; o feed XML puxa o gtin na próxima build do /api/feed.');
})().catch((e) => { console.error('❌ ERRO:', e); process.exit(1); });
