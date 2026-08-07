// Marca do fabricante a partir do nome do produto.
//
// Vive em `shared/` — junto de company-profile — porque é importado tanto pelo
// feed serverless (`api/feed.js`) quanto pelo Schema.org do site
// (`src/components/ProductJsonLd.tsx`). O Google compara o feed com a página de
// destino, então os dois precisam declarar a mesma marca.
//
// Não mover para `api/_lib/`: o dev server faz proxy de `/api` para a função
// serverless, então o import do client viraria uma requisição `/api/_lib/...`
// e o Vite devolveria 404 no lugar do módulo, quebrando a página de produto.
//
// O Firestore não tem campo `brand`. Declarar "NikkeyBox" em tudo faz o
// Google reprovar por marca incorreta — os produtos são Kewpie, Bioré, Glico —
// e ainda colide com as outras empresas chamadas "NikkeyBox", de logística
// e de frete de automóveis.
//
// A primeira entrada que casar vence, então a ordem importa: "ReFa" precisa vir
// antes de "honey" por causa de "ReFa Honey Queen", e "Senka" antes de qualquer
// coisa da Shiseido. Marcas de uma sigla só (VT, OXY, QY, Kao) usam `\b` para
// não casar dentro de outra palavra — sem isso "Deoxyribose" viraria OXY.
export const BRANDS = [
  ['Beauty of Joseon', /beauty of joseon/i],
  ['The Animal Organics', /the animal organics/i],
  ['Keana Nadeshiko', /keana nadeshiko/i],
  ['Nature Republic', /nature republic/i],
  ['Yum Yum Yum!', /yum yum yum/i],
  ['Japan Premium', /japan premium/i],
  ['Black Thunder', /black thunder/i],
  ['Tokyo Banana', /tokyo banana/i],
  ['Hada Labo', /hada\s*labo/i],
  ['Skin Aqua', /skin\s*aqua/i],
  ['Melano CC', /melano\s*cc/i],
  ['Dr. Althea', /dr\.?\s*althea/i],
  ['Baby Star', /baby star/i],
  ['Gwangcheon', /gwangcheon/i],
  ['Ito En', /\bito en\b/i],
  ['ReFa', /\brefa\b/i],
  ['SKIN1004', /skin\s*1004/i],
  ['Medicube', /medicube/i],
  ['Bioré', /bior[eé]/i],
  ['&honey', /&\s*honey|\bhoney\b/i],
  ['Glico', /\bglico\b|\bpocky\b|\bpretz\b|\bcaplico\b/i],
  ['Obagi', /\bobagi\b/i],
  ['Anessa', /\banessa\b/i],
  ['Senka', /\bsenka\b/i],
  ['Naturie', /naturie|hatomugi/i],
  ['Doggyman', /doggyman/i],
  ['Elizavecca', /elizavecca/i],
  ['Cosparade', /cosparade/i],
  ['Marukome', /marukome/i],
  ['Marumiya', /marumiya/i],
  ['Maruchan', /maruchan/i],
  ['Morinaga', /morinaga/i],
  ['LuLuLun', /lululun/i],
  ['Celimax', /celimax/i],
  ['Kasugai', /kasugai/i],
  ['House Foods', /\bhouse\b/i],
  ['lilyeve', /lilyeve/i],
  ['Tsubaki', /tsubaki/i],
  ['Umaibo', /umaibo/i],
  ['TIRTIR', /tirtir/i],
  ['Calbee', /calbee/i],
  ['Gatsby', /gatsby/i],
  ['Eyebon', /eyebon/i],
  ['Peloty', /peloty/i],
  ['Ululis', /ululis/i],
  ['Kewpie', /\bkewpie\b/i],
  ['KitKat', /kit\s*kat/i],
  ['PetitQ', /petit\s*q/i],
  ['Nissin', /\bnissin\b/i],
  ['Kanro', /\bkanro\b/i],
  ['Lotte', /\blotte\b/i],
  ['Meiji', /\bmeiji\b/i],
  ['Nippn', /\bnippn\b/i],
  ['Kose', /\bkose\b/i],
  ['Fino', /\bfino\b/i],
  ['Ritz', /\britz\b/i],
  ['CIAO', /\bciao\b/i],
  ['S&B', /s\s*&\s*b\b/i],
  ['DHC', /\bdhc\b/i],
  ['OXY', /\boxy\b/i],
  ['Kao', /\bkao\b/i],
  ['8x4', /\b8x4\b/i],
  ['VT', /\bvt\b/i],
  ['QY', /\bqy\b/i],
];

// Sem marca reconhecida, a loja assina o produto. "Store" no fim evita a colisão
// com as transportadoras homônimas.
const FALLBACK_BRAND = 'NikkeyBox Store';

export function detectBrand(name) {
  const alvo = String(name || '');
  for (const [marca, padrao] of BRANDS) {
    if (padrao.test(alvo)) return marca;
  }
  return FALLBACK_BRAND;
}