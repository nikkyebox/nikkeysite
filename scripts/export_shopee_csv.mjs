// Exporta todos os produtos do Firestore para um CSV de cadastro em massa (Shopee).
// Uso: node scripts/export_shopee_csv.mjs
//
// IMPORTANTE (ver README impresso no final):
// A Shopee gera o template de "Adicionar em Massa" dinamicamente por CATEGORIA,
// dentro da própria Central do Vendedor — não existe uma planilha fixa universal.
// Este CSV usa as colunas padrão documentadas pela Shopee (nome, categoria, descrição,
// SKU, preço, estoque, peso, dimensões, imagens, variação) para servir como fonte
// única de dados — cole os valores no template oficial baixado em
// Produtos > Ferramentas de Produtos > Adicionar em Massa.
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { writeFileSync, mkdirSync } from 'node:fs';

const firebaseConfig = {
  apiKey: "PENDING_NIKKEY33F93_API_KEY",
  authDomain: "nikkey-33f93.firebaseapp.com",
  projectId: "nikkey-33f93",
  storageBucket: "nikkey-33f93.firebasestorage.app",
  messagingSenderId: "PENDING_NIKKEY33F93_MSG_SENDER_ID",
  appId: "PENDING_NIKKEY33F93_APP_ID",
  measurementId: "PENDING_NIKKEY33F93_MEASUREMENT_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---- Réplica exata da lógica de preço/câmbio usada no app (src/utils/pricing.ts + src/services/fxService.ts) ----
const roundYen = (value) => {
  const r = value % 100;
  if (r === 0 || r === 50 || r === 80) return value;
  if (r < 50) return value - r + 50;
  if (r <= 80) return value - r + 80;
  return value - r + 100;
};
const hasDiscount = (p) => (p.discountPercent || 0) > 0 && (p.discountPercent || 0) < 100;
const getVariants = (p) => {
  if (p.variants && p.variants.length > 0) return p.variants;
  const list = [];
  if (p.prices?.small) list.push({ id: 'small', label: 'Pequeno', price: p.prices.small });
  if (p.prices?.large) list.push({ id: 'large', label: 'Grande', price: p.prices.large });
  if (list.length === 0) list.push({ id: 'small', label: 'Único', price: p.prices?.small || 0 });
  return list;
};
const baseYen = (p, size) => {
  if (!p.variants?.length) {
    if (size === 'small') return roundYen(p.prices?.small || 0);
    if (size === 'large') return roundYen(p.prices?.large || p.prices?.small || 0);
  }
  const v = getVariants(p).find((x) => x.id === size) || getVariants(p)[0];
  return roundYen(v?.price || 0);
};
const effectiveYen = (p, size) => {
  const base = baseYen(p, size);
  if (!hasDiscount(p)) return base;
  return roundYen(Math.round(base * (1 - p.discountPercent / 100)));
};

// FX: mesma fórmula do app (fxService.convertYen), fonte pública open.er-api.com (fallback do próprio app)
const BUFFER_YEN = 5;
const RATE_CUSHION_FALLBACK = 0.04;
let jpyToBrl = 1 / 28; // fallback do app caso a API esteja fora
let fxSource = 'fallback-hardcoded';
try {
  const res = await fetch('https://open.er-api.com/v6/latest/JPY');
  const data = await res.json();
  if (data?.rates?.BRL > 0) {
    jpyToBrl = data.rates.BRL;
    fxSource = 'open.er-api.com (' + data.time_last_update_utc + ')';
  }
} catch (e) {
  console.warn('Falha ao buscar câmbio ao vivo, usando fallback fixo:', e.message);
}
const yenToBrl = (yen) => Math.round((yen + BUFFER_YEN) * jpyToBrl * (1 + RATE_CUSHION_FALLBACK) * 100) / 100;
console.log(`Câmbio usado: 1 JPY = ${jpyToBrl.toFixed(6)} BRL (fonte: ${fxSource}) + buffer ¥${BUFFER_YEN} + cushion ${RATE_CUSHION_FALLBACK * 100}% — igual ao app`);

// ---- Busca produtos ----
const snap = await getDocs(collection(db, 'products'));
const products = [];
snap.forEach((d) => {
  const data = d.data();
  if (data.__deleted) return;
  products.push({ id: d.id, ...data });
});
console.log('Produtos brutos no Firestore:', products.length);

const eligible = products.filter((p) => !p.hidden && p.image);
console.log('Elegíveis (publicados, com imagem):', eligible.length);

const DEFAULT_CATEGORIES = [
  { id: 'cosmeticos', label: 'Cosméticos' },
  { id: 'doces', label: 'Doces & Chás' },
  { id: 'acessorios', label: 'Acessórios' },
  { id: 'papelaria', label: 'Papelaria' },
  { id: 'eletronicos', label: 'Eletrônicos' },
  { id: 'masculino', label: 'Masculino' },
  { id: 'vestuario', label: 'Vestuário' },
  { id: 'higiene', label: 'Higiene & Saúde' },
  { id: 'pet', label: 'Pet' },
];
const CATEGORY_LABELS = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c.label]));
try {
  const catSnap = await getDoc(doc(db, 'settings', 'product_categories'));
  const custom = catSnap.exists() ? (catSnap.data().list || []) : [];
  for (const c of custom) if (c?.id && !CATEGORY_LABELS[c.id]) CATEGORY_LABELS[c.id] = c.label;
} catch (e) {
  console.warn('Falha ao buscar categorias personalizadas (usando só as padrão):', e.message);
}

const isBase64Image = (url) => typeof url === 'string' && url.startsWith('data:');
const isUsableUrl = (url) => typeof url === 'string' && /^https?:\/\//.test(url);

const rows = [];
let base64ImageCount = 0;

for (const p of eligible) {
  const variants = getVariants(p);
  const coverUsable = isUsableUrl(p.image);
  if (isBase64Image(p.image) || (p.gallery || []).some(isBase64Image)) base64ImageCount++;

  const galleryUrls = (p.gallery || []).filter(isUsableUrl).filter((g) => g !== p.image);
  const images = [coverUsable ? p.image : '', ...galleryUrls].filter(Boolean).slice(0, 9);
  while (images.length < 9) images.push('');

  const weightKg = p.weightGrams ? (p.weightGrams / 1000).toFixed(3) : '';
  const dims = p.packageDimensionsCm || {};

  const multiVariant = variants.length > 1;
  for (const v of variants) {
    const priceYen = effectiveYen(p, v.id);
    const priceBrl = yenToBrl(priceYen);
    const stock = p.stock && !p.stock.unlimited ? p.stock.quantity : 999; // ilimitado -> estoque alto padrão (ajustar manualmente se preferir)
    const skuVariacao = multiVariant ? `${p.sku || p.id}-${v.id}` : (p.sku || p.id);

    rows.push({
      'SKU Pai': p.sku || p.id,
      'SKU Variação': skuVariacao,
      'Nome do Produto': p.name || '',
      'Nome da Variação': multiVariant ? 'Opção' : '',
      'Valor da Variação': multiVariant ? v.label : 'Padrão',
      'Categoria (referência interna)': CATEGORY_LABELS[p.category] || p.category || '',
      'Descrição do Produto': (p.description || '').replace(/\r?\n/g, ' ').trim(),
      'Marca': 'Sem Marca',
      'Preço (R$)': priceBrl.toFixed(2),
      'Preço Original em Ienes (referência)': priceYen,
      'Estoque': stock,
      'Peso(kg)': weightKg,
      'Comprimento(cm)': dims.lengthCm ? dims.lengthCm.toFixed(1) : '',
      'Largura(cm)': dims.widthCm ? dims.widthCm.toFixed(1) : '',
      'Altura(cm)': dims.heightCm ? dims.heightCm.toFixed(1) : '',
      'Dias de Preparação': 3,
      'Imagem de Capa': images[0],
      'Imagem 2': images[1],
      'Imagem 3': images[2],
      'Imagem 4': images[3],
      'Imagem 5': images[4],
      'Imagem 6': images[5],
      'Imagem 7': images[6],
      'Imagem 8': images[7],
      'Observações': isBase64Image(p.image) ? 'IMAGEM LOCAL (base64) — precisa subir a foto manualmente, URL não disponível' : '',
    });
  }
}

console.log('Linhas geradas (1 por variação):', rows.length);
console.log('Produtos com imagem ainda em base64 (não têm URL para o feed):', base64ImageCount);

// ---- CSV ----
const headers = Object.keys(rows[0]);
const escapeCsv = (val) => {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
};
const csvLines = [headers.map(escapeCsv).join(',')];
for (const row of rows) {
  csvLines.push(headers.map((h) => escapeCsv(row[h])).join(','));
}
const csv = '\uFEFF' + csvLines.join('\r\n') + '\r\n'; // BOM para acentuação correta no Excel

const outPath = process.argv[2] || 'exports/shopee_produtos.csv';
mkdirSync(outPath.split(/[\\/]/).slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(outPath, csv, 'utf8');
console.log('CSV salvo em:', outPath, `(${rows.length} linhas, ${(csv.length / 1024).toFixed(0)} KB)`);
