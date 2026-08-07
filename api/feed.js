// Feed de catálogo para indexadores (Google Merchant / Shopping).
// Gera o preço TOTAL estimado = preço do produto + frete pelo peso.
// Frete usa o peso real (weightGrams) arredondado para a faixa do Japan Post.
//
// Uso:
//   /api/feed              → XML Google Merchant, destino Brasil (BRL+¥)
//   /api/feed?region=eu    → XML Google Merchant, destino Europa (EUR+¥)
//   /api/feed?region=us    → XML Google Merchant, destino EUA (USD+¥)
//   /api/feed?format=json  → JSON com os mesmos dados
//
// Produtos são públicos no Firestore (allow read: if true) — lê via REST sem auth.

import { detectBrand } from '../shared/brand.js';
import { packedWeightG } from '../shared/weight.js';
import { minEffectiveYen, variantPrices } from '../shared/pricing.js';
import { taxDisclosure } from '../shared/tax-disclosure.js';
import { fetchProducts, escapeXml, isVisibleInternationally } from './_lib/firestore-products.js';
import { convertYen as convertYenFx, getFxRates } from './_lib/fx.js';

const SITE_URL = 'https://www.nikkeybox-store.com';

// Idioma do aviso por região do feed. `eu` é o feed em euro, servido em
// português porque Portugal encabeça REGION_COUNTRIES.eu.
const DISCLOSURE_LANG = { br: 'pt', eu: 'pt', us: 'en' };

export function feedDisclosure(region) {
  return taxDisclosure(DISCLOSURE_LANG[region] || 'pt').body;
}

// Descrição do item = texto do produto + aviso, dentro dos 5000 caracteres do
// Merchant. O corte é feito no texto do produto, nunca no aviso: aviso truncado
// não divulga nada.
export function merchantDescription(description, region) {
  const disclosure = feedDisclosure(region);
  const source = String(description || '').slice(0, 5000 - disclosure.length - 1).trimEnd();
  return `${source} ${disclosure}`.trim();
}

// A conversão é a MESMA de `_lib/fx.js`, que também serve o checkout: Wise →
// open-er-api → taxa fixa, cushion de 4% fora da Wise, buffer de ¥5.
//
// O feed tinha uma tabela própria, fixa em 1/28 com cushion de 6% e sem consulta
// à taxa viva. Isso publicava a maionese Kewpie por R$45,62 enquanto o site
// cobrava R$38 — 20% acima. O Google compara o preço do feed com o da página de
// destino e suspende a conta por divergência.
const CURRENCY_BY_REGION = { eu: 'EUR', us: 'USD', br: 'BRL' };

function currencyForRegion(region) {
  return CURRENCY_BY_REGION[region] || 'BRL';
}

// ── Tabelas Japan Post (mesmos dados de src/utils/japanPostRates.ts) ─────────
// Zona 1 = China/Coreia/Taiwan · 2 = Ásia · 3 = Europa/Oceania · 4 = EUA · 5 = Brasil
const E_LIGHT = {
  1: [720,820,920,1020,1120,1220,1320,1420,1520,1620,1720,1820,1920,2020,2120,2220,2320,2420,2520,2620],
  2: [750,870,990,1110,1230,1350,1470,1590,1710,1830,1950,2070,2190,2310,2430,2550,2670,2790,2910,3030],
  3: [880,1060,1240,1420,1600,1780,1960,2140,2320,2500,2680,2860,3040,3220,3400,3580,3760,3940,4120,4300],
  4: [1200,1410,1620,1830,2040,2250,2460,2670,2880,3090,3300,3510,3720,3930,4140,4350,4560,4770,4980,5190],
  5: [920,1180,1440,1700,1960,2220,2480,2740,3000,3260,3520,3780,4040,4300,4560,4820,5080,5340,5600,5860],
};
const AIR_PARCEL = {
  1: [2050,2750,3450,4150,4850,5550,6250,6950,7650,8350,8850,9350,9850,10350,10850,11350,11850,12350,12850,13350,13850,14350,14850,15350,15850,16350,16850,17350,17850,18350],
  2: [2500,3700,4900,6100,7300,8500,9700,10900,12100,13300,13950,14600,15250,15900,16550,17200,17850,18500,19150,19800,20450,21100,21750,22400,23050,23700,24350,25000,25650,26300],
  3: [3850,6000,8150,10300,12450,14600,16750,18900,21050,23200,24800,26400,28000,29600,31200,32800,34400,36000,37600,39200,40800,42400,44000,45600,47200,48800,50400,52000,53600,55200],
  4: [4200,6700,9200,11700,14200,16700,19200,21700,24200,26700,28700,30700,32700,34700,36700,38700,40700,42700,44700,46700,48700,50700,52700,54700,56700,58700,60700,62700,64700,66700],
  5: [4550,7250,9950,12650,15350,18050,20750,23450,26150,28850,30650,32450,34250,36050,37850,39650,41450,43250,45050,46850,48650,50450,52250,54050,55850,57650,59450,61250,63050,64850],
};

function getELightRate(weightG, zone) {
  if (weightG <= 0 || weightG > 2000) return null;
  return E_LIGHT[zone][Math.ceil(weightG / 100) - 1] ?? null;
}
function getAirParcelRate(weightG, zone) {
  if (weightG <= 0 || weightG > 30000) return null;
  return AIR_PARCEL[zone][Math.min(Math.ceil(weightG / 1000) - 1, 29)] ?? null;
}

// Frete mais barato disponível para o peso (¥). Peso é o real do produto + overhead.
function cheapestShippingYen(weightG, zone) {
  const billable = Math.max(100, weightG); // peso real já cadastrado
  const opts = [];
  const eLight = getELightRate(billable, zone);
  if (eLight != null) opts.push(eLight);
  const air = getAirParcelRate(billable, zone);
  if (air != null) opts.push(air);
  return opts.length ? Math.min(...opts) : null;
}

// ── Preço: `shared/pricing.js`, o mesmo módulo da vitrine e do checkout ──────
// Este arquivo tinha a própria cópia, anunciada como "espelha
// src/utils/pricing.ts" — e sem o arredondamento dos outros dois. Três produtos
// saíam com preço menor do que o site cobra.
// Peso usado para frete: weightGrams + embalagem real, ou estimativa por tamanho
function productWeightG(p) {
  if (p.weightGrams && p.weightGrams > 0) return packedWeightG(p.weightGrams);
  return packedWeightG(500);
}

// Países de destino por região do feed (ISO Merchant + zona Japan Post).
// Cada feed declara o frete para TODOS os países da sua moeda — o Google exige
// que o frete cubra os países de destino, senão reprova com "falta info de frete".
const REGION_COUNTRIES = {
  br: [{ iso: 'BR', zone: 5 }],
  eu: [
    { iso: 'PT', zone: 3 }, { iso: 'FR', zone: 3 }, { iso: 'IT', zone: 3 },
    { iso: 'ES', zone: 3 }, { iso: 'DE', zone: 3 }, { iso: 'NL', zone: 3 },
    { iso: 'BE', zone: 3 }, { iso: 'IE', zone: 3 }, { iso: 'AT', zone: 3 },
  ],
  us: [
    { iso: 'US', zone: 4 }, { iso: 'CA', zone: 3 }, { iso: 'GB', zone: 3 },
    { iso: 'AU', zone: 3 }, { iso: 'NZ', zone: 3 }, { iso: 'MX', zone: 3 },
    { iso: 'SG', zone: 2 }, { iso: 'JP', zone: 1 },
  ],
};

// Categoria ampla por departamento da loja. Produtos com identidade inequívoca
// recebem uma categoria mais profunda em `classifyMerchantProduct`.
export const GOOGLE_CATEGORY = { cosmeticos: 469, doces: 422, pet: 2 };
const DEFAULT_CATEGORY = 469;

const HAIR_CATEGORY = {
  care: 486,
  kit: 8452,
  shampoo: 543615,
  conditioner: 543616,
  shampooConditionerSet: 543617,
};

const HAIR_PRODUCT_TYPE_BR = {
  care: 'Saúde e Beleza > Cuidados Pessoais > Cuidados com os Cabelos > Tratamentos Capilares',
  mask: 'Saúde e Beleza > Cuidados Pessoais > Cuidados com os Cabelos > Máscaras Capilares',
  oil: 'Saúde e Beleza > Cuidados Pessoais > Cuidados com os Cabelos > Óleos e Séruns Capilares',
  kit: 'Saúde e Beleza > Cuidados Pessoais > Cuidados com os Cabelos > Kits de Cuidados com os Cabelos',
  shampoo: 'Saúde e Beleza > Cuidados Pessoais > Cuidados com os Cabelos > Xampus',
  conditioner: 'Saúde e Beleza > Cuidados Pessoais > Cuidados com os Cabelos > Condicionadores',
  shampooConditionerSet: 'Saúde e Beleza > Cuidados Pessoais > Cuidados com os Cabelos > Conjuntos de Xampu e Condicionador',
};

function normalizedProductIdentity(p) {
  return [p.name, ...(Array.isArray(p.tags) ? p.tags : [])]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function classifyMerchantProduct(p, region = 'br') {
  const fallbackCategory = GOOGLE_CATEGORY[p.category] || DEFAULT_CATEGORY;
  if (p.category !== 'cosmeticos') return { googleCategory: fallbackCategory };

  const identity = normalizedProductIdentity(p);
  const hasShampoo = /\b(shampoo|xampu)\b/.test(identity);
  const hasConditioner = /\b(conditioner|condicionador)\b/.test(identity);
  const isMask = /\b(hair mask|hair pack|mascara capilar|mascara para cabelos?)\b/.test(identity);
  const isOil = /\b(hair oil|hair serum|oleo capilar|serum capilar|essencia capilar)\b/.test(identity);
  const isOtherHairCare = /\b(hair treatment|tratamento capilar|couro cabeludo|scalp)\b/.test(identity);
  const isHairKit = /\bkit\b/.test(identity)
    && (hasShampoo || hasConditioner || isMask || isOil || isOtherHairCare);
  const productType = region === 'br' ? HAIR_PRODUCT_TYPE_BR : {};

  if (hasShampoo && hasConditioner) {
    return {
      googleCategory: HAIR_CATEGORY.shampooConditionerSet,
      productType: productType.shampooConditionerSet,
    };
  }
  if (isHairKit) {
    return { googleCategory: HAIR_CATEGORY.kit, productType: productType.kit };
  }
  if (hasShampoo) {
    return { googleCategory: HAIR_CATEGORY.shampoo, productType: productType.shampoo };
  }
  if (hasConditioner) {
    return { googleCategory: HAIR_CATEGORY.conditioner, productType: productType.conditioner };
  }
  if (isMask || isOil || isOtherHairCare) {
    return {
      googleCategory: HAIR_CATEGORY.care,
      productType: isMask ? productType.mask : isOil ? productType.oil : productType.care,
    };
  }
  return { googleCategory: fallbackCategory };
}

function merchantImageUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return '';
  let image = url;
  if (image.includes('res.cloudinary.com')) {
    image = image.replace(/\/upload\/(?:[a-z]{1,3}_[^/]*\/)?/, '/upload/f_jpg,q_auto:best/');
    image = image.replace(/\.webp(\?.*)?$/i, '.jpg$1');
  }
  return image;
}

export function merchantImagesForProduct(p) {
  const candidates = [
    p.image,
    ...(Array.isArray(p.gallery) ? p.gallery : []),
  ];
  const images = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const image = merchantImageUrl(candidate);
    if (!image || seen.has(image)) continue;
    seen.add(image);
    images.push(image);
    if (images.length === 11) break; // principal + até 10 additional_image_link
  }
  // Thumbnail é reduzida para cards; use apenas quando não existir foto completa.
  if (images.length === 0) {
    const thumbnail = merchantImageUrl(p.thumbnail);
    if (thumbnail) images.push(thumbnail);
  }
  return images;
}

// ── Monta os itens do catálogo ───────────────────────────────────────────────
function buildCatalog(products, region, rates) {
  const zone = region === 'eu' ? 3 : region === 'us' ? 4 : 5;
  const currency = currencyForRegion(region);

  return products
    .filter(p => {
      if (!isVisibleInternationally(p)) return false;
      return variantPrices(p).length > 0;
    })
    .map(p => {
      const productYen = minEffectiveYen(p);
      if (!productYen) return null;

      // Imagem principal + imagens adicionais públicas em JPG. Base64/data-URI
      // e duplicatas ficam de fora; o Merchant aceita até 10 imagens adicionais.
      const images = merchantImagesForProduct(p);
      const image = images[0] || '';
      if (!image) return null;

      const weightG = productWeightG(p);
      const shipYen = cheapestShippingYen(weightG, zone) || 0;
      const totalYen = productYen + shipYen;

      // Frete por país de destino da região (cada país tem sua zona/preço)
      const shippingByCountry = (REGION_COUNTRIES[region] || []).map(c => ({
        iso: c.iso,
        priceLocal: convertYenFx(cheapestShippingYen(weightG, c.zone) || 0, currency, rates),
      }));

      const classification = classifyMerchantProduct(p, region);
      const link = `${SITE_URL}/produto/${p.id}`;
      return {
        id: p.id,
        gtin: p.gtin || undefined,
        title: String(p.name || p.id).replace(/\s+/g, ' ').trim().slice(0, 150),
        description: merchantDescription(p.description || p.name || p.id, region),
        link,
        canonicalLink: link,
        image,
        additionalImages: images.slice(1),
        availability: (p.stock && !p.stock.unlimited && p.stock.quantity === 0) ? 'out_of_stock' : 'in_stock',
        condition: 'new',
        brand: detectBrand(p.name),
        googleCategory: classification.googleCategory,
        productType: classification.productType,
        weightG,
        priceYen: productYen,
        shippingYen: shipYen,
        totalYen,
        priceLocal: convertYenFx(productYen, currency, rates),
        shippingLocal: convertYenFx(shipYen, currency, rates),
        totalLocal: convertYenFx(totalYen, currency, rates),
        shippingByCountry,
        currency,
      };
    })
    .filter(Boolean);
}

// ── Saída XML (Google Merchant RSS 2.0 + namespace g:) ───────────────────────
// title/description/link usam RSS padrão; campos próprios do Google usam g:
// google_product_category sai da categoria da loja. identifier_exists depende de
// o produto ter GTIN (JAN/EAN) cadastrado: com GTIN -> yes + brand + gtin (ideal);
// sem GTIN -> no, SEM brand (declarar brand junto de identifier_exists=no e
// exatamente o padrao que o Google reprova como "GTIN ausente em produto de marca").
function toXml(items, region) {
  const title = region === 'eu' ? 'NikkeyBox — Catálogo (Europa)'
    : region === 'us' ? 'NikkeyBox — Catalog (USA)'
    : 'NikkeyBox — Catálogo (Brasil)';
  const entries = items.map(it => {
    // Um bloco de frete por país de destino
    const shippingBlocks = (it.shippingByCountry || []).map(s => `
      <g:shipping>
        <g:country>${s.iso}</g:country>
        <g:service>Japan Post</g:service>
        <g:price>${s.priceLocal.toFixed(2)} ${it.currency}</g:price>
      </g:shipping>`).join('');
    // Bloco de identificacao: com GTIN real -> gtin + marca + identifier_exists=yes
    // (produto propriamente identificado, melhor matching no Shopping). Sem GTIN ->
    // identifier_exists=no e NENHUMA marca/gtin/mpn (unica forma declarada pelo
    // Google de tratar "custom/no-identifier" sem reprovacao).
    const identifierBlock = it.gtin
      ? `      <g:gtin>${escapeXml(it.gtin)}</g:gtin>
      <g:brand>${escapeXml(it.brand)}</g:brand>
      <g:identifier_exists>yes</g:identifier_exists>`
      : `      <g:identifier_exists>no</g:identifier_exists>`;
    const additionalImageBlocks = (it.additionalImages || []).map(image => `
      <g:additional_image_link>${escapeXml(image)}</g:additional_image_link>`).join('');
    const productTypeBlock = it.productType
      ? `
      <g:product_type>${escapeXml(it.productType)}</g:product_type>`
      : '';
    return `
    <item>
      <g:id>${escapeXml(it.id)}</g:id>
      <title>${escapeXml(it.title)}</title>
      <description>${escapeXml(it.description)}</description>
      <link>${escapeXml(it.link)}</link>
      <g:canonical_link>${escapeXml(it.canonicalLink)}</g:canonical_link>
      <g:image_link>${escapeXml(it.image)}</g:image_link>${additionalImageBlocks}
      <g:availability>${it.availability}</g:availability>
      <g:condition>new</g:condition>
      <g:price>${it.priceLocal.toFixed(2)} ${it.currency}</g:price>
${identifierBlock}
      <g:google_product_category>${it.googleCategory}</g:google_product_category>${productTypeBlock}${shippingBlocks}
      <g:shipping_weight>${(it.weightG / 1000).toFixed(2)} kg</g:shipping_weight>
      <g:custom_label_0>${it.totalLocal.toFixed(2)} ${it.currency}</g:custom_label_0>
    </item>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(feedDisclosure(region))}</description>${entries}
  </channel>
</rss>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const region = ['eu', 'us'].includes(req.query.region) ? req.query.region : 'br';
  const format = req.query.format === 'json' ? 'json' : 'xml';

  try {
    const [products, rates] = await Promise.all([fetchProducts(), getFxRates()]);
    const items = buildCatalog(products, region, rates);

    // Cache 6h no CDN da Vercel — feed não precisa ser em tempo real
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).json({ region, count: items.length, items });
    } else {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.status(200).send(toXml(items, region));
    }
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
