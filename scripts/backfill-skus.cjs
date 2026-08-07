#!/usr/bin/env node
/**
 * Backfill de SKUs (CommonJS — roda com `node`).
 * Atribui um SKU único (JE-<CAT>-<NNNN>) a TODOS os produtos do Firestore que
 * ainda não possuem um. Produtos que já têm SKU válido são preservados (não duplica).
 *
 * Uso (na raiz do projeto):
 *   node scripts/backfill-skus.cjs --dry-run   # preview — NÃO grava nada
 *   node scripts/backfill-skus.cjs             # grava os SKUs no Firestore
 *
 * NOTA: a lógica abaixo espelha src/utils/sku.ts (categoryCode/assignSkus),
 * mantida aqui em JS puro para rodar com `node` (sem bun/tsx).
 */
const admin = require('firebase-admin');
const sa = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

// ── Espelho de src/utils/sku.ts ────────────────────────────────────────────
const CATEGORY_CODES = {
  cosmeticos: 'COS', doces: 'DOC', acessorios: 'ACE', papelaria: 'PAP',
  eletronicos: 'ELE', masculino: 'MAS', vestuario: 'VES', higiene: 'HIG',
  docedeleite: 'DLT',
};
function categoryCode(category) {
  if (CATEGORY_CODES[category]) return CATEGORY_CODES[category];
  const cleaned = (category || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  return cleaned.slice(0, 3) || 'GEN';
}
function skuPrefix(category) { return `JE-${categoryCode(category)}`; }
function isValidSku(sku) { return !!sku && /^JE-[A-Z]{2,4}-\d{4}$/.test(sku); }
function assignSkus(items) {
  const assignments = {};
  const byCategory = new Map();
  for (const it of items) {
    const arr = byCategory.get(it.category) || [];
    arr.push(it);
    byCategory.set(it.category, arr);
  }
  for (const [category, list] of byCategory) {
    const prefix = skuPrefix(category);
    const re = new RegExp(`^${prefix}-(\\d{4})$`);
    const used = new Set();
    for (const it of list) {
      const m = (it.sku || '').match(re);
      if (m) used.add(Number(m[1]));
    }
    let n = 1;
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    for (const it of sorted) {
      if (isValidSku(it.sku)) continue;
      while (used.has(n)) n++;
      assignments[it.id] = `${prefix}-${String(n).padStart(4, '0')}`;
      used.add(n);
      n++;
    }
  }
  return assignments;
}
// ───────────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`${DRY_RUN ? '🔍 DRY-RUN' : '🚀 BACKFILL'} de SKUs — lendo produtos do Firestore...\n`);

  const snap = await db.collection('products').get();
  const items = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.__deleted) return; // soft-deleted
    items.push({ id: d.id, category: data.category || '', sku: data.sku || undefined, name: data.name || '' });
  });

  const assignments = assignSkus(items);
  const total = Object.keys(assignments).length;

  console.log(`Total de produtos: ${items.length}`);
  console.log(`Produtos que receberão SKU: ${total}`);
  console.log(`Produtos já com SKU válido: ${items.length - total}\n`);

  if (total === 0) {
    console.log('✅ Nada a fazer — todos os produtos já possuem SKU.');
    return;
  }

  for (const [id, sku] of Object.entries(assignments)) {
    const p = items.find((i) => i.id === id);
    console.log(`  ${sku}  ${id}${p && p.name ? '  —  ' + p.name : ''}`);
  }

  if (DRY_RUN) {
    console.log('\n🔍 Dry-run: nada foi gravado. Rode sem --dry-run para aplicar no Firestore.');
    return;
  }

  const batch = db.batch();
  for (const [id, sku] of Object.entries(assignments)) {
    batch.set(
      db.collection('products').doc(id),
      { sku, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`\n✅ ${total} SKU(s) gravado(s) no Firestore com sucesso!`);
})().catch((e) => { console.error('❌ ERRO:', e); process.exit(1); });
