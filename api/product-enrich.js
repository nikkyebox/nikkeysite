// Enriquecimento automático de produto (somente admin).
// 1. Busca produto no Yahoo Shopping/Rakuten → preço ¥ + fotos reais.
// 2. Baixa a descrição real do Yahoo quando a API traz descrição vazia.
// 3. Usa Groq para manter nome em inglês e traduzir somente a descrição.
// 4. Sem marketplace: AI estima o preço com base no próprio conhecimento.
// Preço de venda = custo de aquisição × 1.5 (50% de markup).

const RAKUTEN_APP_ID = process.env.RAKUTEN_APP_ID || '';
const YAHOO_APP_ID   = process.env.YAHOO_APP_ID || ''; // Yahoo! Shopping Client ID
const GROQ_API_KEY   = process.env.GROQ_API_KEY || '';
const DEFAULT_GROQ_MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'];
const DISABLED_GROQ_MODELS = new Set(['moonshotai/kimi-k2-instruct']);
const GROQ_MODELS = uniqueNonEmpty([
  ...(process.env.GROQ_MODEL || '').split(','),
  ...DEFAULT_GROQ_MODELS,
]).filter((model) => !DISABLED_GROQ_MODELS.has(model));

// ---- Rate limiting em memória (10 req/min por IP) --------------------------
const RATE_WINDOW_MS = 60_000;
const RATE_MAX       = 10;
const ipMap          = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipMap) { if (now > entry.resetAt) ipMap.delete(ip); }
}, RATE_WINDOW_MS * 2);

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  let timer = null;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- CORS ------------------------------------------------------------------
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_ORIGINS = [
  'https://nikkeybox-store.com',
  'https://www.nikkeybox-store.com',
  'http://localhost:8080',
  'http://localhost:5173',
];
const VALID_ORIGINS = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

const hasJapanese = (s) => /[぀-ヿ㐀-鿿]/.test(s || '');

function uniqueNonEmpty(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const s = String(value || '').trim();
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function cleanDescription(text, maxLen = 1200) {
  return decodeHtmlEntities(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/(?:\s*-?\s*)?通販\s*-\s*LINEアカウント連携でPayPayポイント.*$/i, '')
    .replace(/Yahoo!ショッピング.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function normalizeDimensionText(text) {
  return decodeHtmlEntities(text)
    .normalize('NFKC')
    .replace(/[×✕✖＊*]/g, 'x')
    .replace(/[㎝]/g, 'cm')
    .replace(/[㎜]/g, 'mm')
    .replace(/\s+/g, ' ')
    .trim();
}

function dimensionNumber(value) {
  const n = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function makePackageDimensions(a, b, c, unitHint, raw, source) {
  let widthCm = dimensionNumber(a);
  let lengthCm = dimensionNumber(b);
  let heightCm = dimensionNumber(c);
  const unit = String(unitHint || '').toLowerCase();

  if (!widthCm || !lengthCm || !heightCm) return null;
  if (unit.includes('mm') || Math.max(widthCm, lengthCm, heightCm) > 120) {
    widthCm /= 10;
    lengthCm /= 10;
    heightCm /= 10;
  }

  const values = [widthCm, lengthCm, heightCm];
  if (!values.every((n) => n > 0 && n <= 200)) return null;

  return {
    widthCm: Math.round(widthCm * 10) / 10,
    lengthCm: Math.round(lengthCm * 10) / 10,
    heightCm: Math.round(heightCm * 10) / 10,
    source,
    raw: String(raw || '').slice(0, 180),
  };
}

// ---- Extrai peso em gramas do texto ou de campos estruturados ---------------
function extractWeightGrams(item, extraText) {
  // 1. Campo estruturado da API Rakuten: soujyuuryou (総重量) em gramas
  const raw = item?.soujyuuryou ?? item?.itemWeight ?? item?.weight ?? null;
  if (raw != null) {
    const n = Number(String(raw).replace(/[^0-9.]/g, ''));
    if (n > 0 && n < 50000) return Math.round(n);
  }

  // 2. Extrai do texto livre (descrição/nome/specs)
  const text = normalizeDimensionText(
    [item?.itemName, item?.itemCaption, item?.itemDescription, extraText].filter(Boolean).join('\n')
  );

  // Padrões japoneses: "重量: 250g", "総重量 300g", "内容量：120g", "本体重量：150 g"
  const patterns = [
    /(?:総重量|本体重量|梱包重量|重量|ウエイト|净重|净含量)\s*[：:]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|グラム|ｇ)/i,
    /(\d+(?:[.,]\d+)?)\s*(kg|g|グラム|ｇ)\s*(?:入り|入|程度|以上|以下|±\d+)?(?:\s|$|、|。|,)/,
    /(?:weight|wt\.?)\s*[：:=]?\s*(\d+(?:[.,]\d+)?)\s*(kg|g)/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m) continue;
    const val = parseFloat(String(m[1]).replace(',', '.'));
    const unit = (m[2] || '').toLowerCase();
    if (!val || val <= 0) continue;
    const grams = unit.startsWith('k') ? Math.round(val * 1000) : Math.round(val);
    if (grams > 0 && grams < 50000) return grams;
  }

  return null;
}

function extractPackageDimensions(text, source) {
  const normalized = normalizeDimensionText(text || '');
  if (!normalized) return null;

  const labeledPatterns = [
    /(?:幅|横|W|width)\D{0,16}(\d+(?:[.,]\d+)?)\s*(cm|mm|センチ|ミリ)?[\s\S]{0,100}(?:奥行|長さ|縦|D|depth|L|length)\D{0,16}(\d+(?:[.,]\d+)?)\s*(cm|mm|センチ|ミリ)?[\s\S]{0,100}(?:高さ|H|height)\D{0,16}(\d+(?:[.,]\d+)?)\s*(cm|mm|センチ|ミリ)?/i,
    /(?:W|width)\D{0,10}(\d+(?:[.,]\d+)?)\s*(cm|mm)?\D{0,30}(?:D|depth|L|length)\D{0,10}(\d+(?:[.,]\d+)?)\s*(cm|mm)?\D{0,30}(?:H|height)\D{0,10}(\d+(?:[.,]\d+)?)\s*(cm|mm)?/i,
  ];

  for (const pattern of labeledPatterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const unit = match[2] || match[4] || match[6] || '';
    const result = makePackageDimensions(match[1], match[3], match[5], unit, match[0], source);
    if (result) return result;
  }

  const contextPattern = /(?:パッケージサイズ|梱包サイズ|商品サイズ|本体サイズ|外寸|寸法|サイズ|size|dimensions?)[\s\S]{0,160}/ig;
  const contexts = [...normalized.matchAll(contextPattern)].map((m) => m[0]);
  for (const context of contexts) {
    const sequence = context.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm|センチ|ミリ)?\s*x\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|センチ|ミリ)?\s*x\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|センチ|ミリ)?/i);
    if (!sequence) continue;
    const unit = sequence[2] || sequence[4] || sequence[6] || '';
    const result = makePackageDimensions(sequence[1], sequence[3], sequence[5], unit, context, source);
    if (result) return result;
  }

  return null;
}

function attrValue(tag, attr) {
  const m = tag.match(new RegExp(`\\b${attr}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return m ? m[2] : '';
}

function extractYahooDescriptionFromHtml(html) {
  const candidates = [];
  const decodedHtml = decodeHtmlEntities(html);

  for (const m of decodedHtml.matchAll(/<script[^>]+type=["']text\/template["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const text = cleanDescription(m[1]);
    if (text.length > 80) candidates.push(text);
  }

  const info = decodedHtml.match(/商品情報[\s\S]{0,2500}/);
  if (info) {
    const text = cleanDescription(info[0]);
    if (text.length > 80) candidates.push(text);
  }

  const metaTags = decodedHtml.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const prop = attrValue(tag, 'property').toLowerCase();
    const name = attrValue(tag, 'name').toLowerCase();
    if (prop !== 'og:description' && name !== 'description') continue;
    const text = cleanDescription(attrValue(tag, 'content'));
    if (text.length > 30) candidates.push(text);
  }

  return candidates
    .filter((text) => !/^高品質なサプリメント、化粧品などを/.test(text))
    .sort((a, b) => b.length - a.length)[0] || '';
}

async function fetchYahooPageDescription(url) {
  let timer = null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !u.hostname.endsWith('shopping.yahoo.co.jp')) return '';

    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });
    if (!r.ok) return '';
    const html = await r.text();
    return extractYahooDescriptionFromHtml(html);
  } catch {
    return '';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- Busca no Rakuten Ichiba -----------------------------------------------
let lastRakutenDebug = null; // diagnóstico temporário

async function searchRakuten(productName) {
  lastRakutenDebug = { hasAppId: !!RAKUTEN_APP_ID, appIdLen: (RAKUTEN_APP_ID || '').length };
  if (!RAKUTEN_APP_ID) { lastRakutenDebug.reason = 'RAKUTEN_APP_ID ausente'; return null; }
  try {
    const params = new URLSearchParams({
      format:        'json',
      keyword:       productName,
      applicationId: RAKUTEN_APP_ID,
      hits:          '5',
      imageFlag:     '1',
      availability:  '1',
      sort:          '-reviewCount',
    });
    const r = await fetchWithTimeout(
      `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?${params}`,
      { headers: { Referer: 'https://nikkeybox-store.com/', 'User-Agent': 'NikkeyBox/1.0' } },
      10000
    );
    lastRakutenDebug.status = r.status;
    if (!r.ok) {
      lastRakutenDebug.body = (await r.text().catch(() => '')).slice(0, 300);
      return null;
    }
    const data = await r.json();
    lastRakutenDebug.count = (data?.Items || []).length;
    // A API envolve cada item em { Item: {...} } ou retorna direto
    const rawItems = (data?.Items || []).map(i => i?.Item || i).filter(Boolean);
    if (!rawItems.length) return null;

    const item = rawItems[0];
    const priceYen    = Number(item.itemPrice) || 0;
    const descJa      = cleanDescription(item.itemCaption || item.itemDescription || '');
    const descSource  = descJa ? 'rakuten-api-description' : 'none';
    const suggestName = (item.itemName || productName).slice(0, 120);
    const packageDimensionsCm = extractPackageDimensions(
      [item.itemName, item.itemCaption, item.itemDescription].filter(Boolean).join('\n'),
      'rakuten'
    );

    // mediumImageUrls pode ser array de strings ou de objetos {imageUrl}
    const rawImgs = item.mediumImageUrls || item.smallImageUrls || [];
    const images  = rawImgs
      .map(u => (typeof u === 'string' ? u : u?.imageUrl || ''))
      .filter(Boolean)
      .map(u => u.replace('?_ex=128x128', '')) // tenta versão maior
      .slice(0, 5);

    const weightGrams = extractWeightGrams(item, [item.itemName, item.itemCaption, item.itemDescription].filter(Boolean).join('\n'));

    return { priceYen, descJa, descSource, images, suggestName, source: 'rakuten', packageDimensionsCm, weightGrams };
  } catch (e) {
    lastRakutenDebug.error = String(e?.message || e);
    return null;
  }
}

// ---- Busca no Yahoo! Shopping (Japão) --------------------------------------
let yahooDebug = null;
async function searchYahoo(productName) {
  const appid = (YAHOO_APP_ID || '').trim();
  yahooDebug = { hasAppId: !!appid, appIdLen: appid.length };
  if (!appid) { yahooDebug.reason = 'YAHOO_APP_ID ausente'; return null; }
  try {
    const params = new URLSearchParams({ appid, query: productName, results: '5' });
    const url = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params}`;
    yahooDebug.qs = params.toString().replace(appid, 'APPID');
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 10000);
    yahooDebug.status = r.status;
    if (!r.ok) { yahooDebug.body = (await r.text().catch(() => '')).slice(0, 400); return null; }
    const data = await r.json();
    const hits = data?.hits || [];
    yahooDebug.count = hits.length;
    yahooDebug.total = data?.totalResultsAvailable;
    yahooDebug.returned = data?.totalResultsReturned;
    yahooDebug.keys = Object.keys(data || {}).slice(0, 8);
    if (!hits.length) return null;

    const item = hits[0];
    const priceYen    = Number(item.price) || 0;
    let descJa        = cleanDescription(item.description || item.headLine || '');
    let descSource    = item.description ? 'yahoo-api-description' : item.headLine ? 'yahoo-headline' : 'none';
    let pageDesc      = '';
    if (descJa.length < 80 && item.url) {
      pageDesc = await fetchYahooPageDescription(item.url);
      yahooDebug.pageDescLen = pageDesc.length;
      yahooDebug.itemUrl = item.url;
      if (pageDesc.length > descJa.length) {
        descJa = pageDesc;
        descSource = 'yahoo-page-description';
      }
    }
    const suggestName = (item.name || productName).slice(0, 120);
    let packageDimensionsCm = extractPackageDimensions(
      [item.name, item.description, item.headLine, descJa].filter(Boolean).join('\n'),
      'yahoo'
    );
    if (!packageDimensionsCm && item.url) {
      pageDesc = pageDesc || await fetchYahooPageDescription(item.url);
      yahooDebug.pageDescLen = Math.max(Number(yahooDebug.pageDescLen) || 0, pageDesc.length);
      yahooDebug.itemUrl = item.url;
      packageDimensionsCm = extractPackageDimensions(
        [item.name, item.description, item.headLine, descJa, pageDesc].filter(Boolean).join('\n'),
        'yahoo'
      );
    }
    yahooDebug.packageDimensionsCm = packageDimensionsCm;
    // Prioriza a imagem ESTENDIDA (exImage = maior/HD). Só usa média se não houver HD.
    const hd  = hits.map(h => h.exImage?.url).filter(Boolean);
    const med = hits.map(h => h.image?.medium || h.image?.small).filter(Boolean);
    // Sobe a resolução das URLs do yimg para a maior versão (/i/z/ = HD)
    const upscale = (u) => u.replace(/\/i\/[a-z]\//, '/i/z/');
    const images = [...new Set((hd.length ? hd : med).map(upscale))].slice(0, 5);
    const weightGrams = extractWeightGrams(item, [item.name, item.description, item.headLine, descJa, pageDesc].filter(Boolean).join('\n'));
    yahooDebug.weightGrams = weightGrams;

    return { priceYen, descJa, descSource, images, suggestName, source: 'yahoo', packageDimensionsCm, weightGrams };
  } catch (e) {
    yahooDebug.error = String(e?.message || e);
    return null;
  }
}

// ---- Tradução / geração de descrição via Groq ------------------------------
async function buildDescription(productName, descJa, targetLang) {
  if (!GROQ_API_KEY) return '';
  const langMap = { pt: 'português do Brasil', en: 'English', ja: '日本語' };
  const langName = langMap[targetLang] || 'português do Brasil';

  const content = descJa
    ? `Você é especialista em produtos japoneses. Traduza fielmente a descrição real abaixo para ${langName}, com texto natural para loja online, mas SEM inventar características, benefícios, ingredientes, volume, modo de uso ou promessas que não estejam no texto original. Mantenha os detalhes técnicos relevantes. Responda SOMENTE com a descrição (2-3 parágrafos curtos), sem título, sem introdução, sem comentários.\n\nDescrição original (japonês/inglês, vinda do marketplace):\n${descJa}`
    : `Você é especialista em produtos japoneses. Não foi encontrada descrição real no marketplace para "${productName}". Escreva uma descrição curta e genérica em ${langName}, sem inventar ingredientes, volume, promessas técnicas, modo de uso ou certificações. Responda SOMENTE com a descrição (1-2 parágrafos curtos), sem título nem comentários.`;

  for (const model of GROQ_MODELS) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body:    JSON.stringify({ model, max_tokens: 700, temperature: 0.65,
          messages: [{ role: 'user', content }] }),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) return text;
    } catch {}
  }
  return '';
}

// ---- Nome em INGLÊS + descrição traduzida (a partir da descrição real do Yahoo) ----
// Regras do lojista: o NOME do produto fica em INGLÊS (não traduz). A DESCRIÇÃO
// vem da descrição original (Yahoo, em japonês) e é traduzida por IA (pt/en/ja).
let i18nDebug = null;
async function buildI18n(productName, descJa) {
  i18nDebug = { called: true };
  if (!GROQ_API_KEY) return null;
  const prompt = `Produto importado do Japão.
Nome de referência (pode estar em inglês/japonês): "${productName}".
Descrição ORIGINAL do produto (japonês, vinda da loja — pode estar vazia):
${descJa || '(vazia — crie uma descrição comercial curta e fiel ao produto)'}

Tarefas:
1) "name_en": o NOME do produto em INGLÊS, curto e comercial (marca + linha + tipo). NÃO use japonês, NÃO use português.
   Se o nome de referência estiver em japonês, traduza/romanize para o nome comercial em inglês.
   Exemplos: 肌ラボ 極潤 化粧水 -> Hada Labo Gokujyun Hyaluronic Acid Lotion; DHC ディープクレンジングオイル -> DHC Deep Cleansing Oil; ビオレUV アクアリッチ -> Biore UV Aqua Rich.
2) Se a DESCRIÇÃO original estiver preenchida, traduza fielmente essa descrição para 3 idiomas, em 2-3 parágrafos curtos, sem inventar fatos. Pode deixar o texto comercial, mas só com informações presentes no original.
   Se estiver vazia, crie uma descrição curta e genérica, sem inventar ingredientes, volume, promessas técnicas, modo de uso ou certificações.

Responda APENAS com JSON válido, sem markdown, exatamente neste formato:
{"name_en":"","pt":{"description":""},"en":{"description":""},"ja":{"description":""}}
pt = português do Brasil, en = English, ja = 日本語.`;

  for (const model of GROQ_MODELS) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model, max_tokens: 1600, temperature: 0.6,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!r.ok) { i18nDebug = { model, status: r.status, body: (await r.text().catch(()=> '')).slice(0,200) }; continue; }
      const data = await r.json();
      let text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) continue;
      // Extrai o bloco JSON do texto (caso venha com markdown/explicação)
      const m = text.match(/\{[\s\S]*\}/);
      if (m) text = m[0];
      const parsed = JSON.parse(text);
      if (parsed?.pt?.description || parsed?.en?.description || parsed?.ja?.description) {
        // Mantém o nome em inglês para TODOS os idiomas (não traduz o nome)
        const nameEn = (parsed.name_en || '').trim();
        i18nDebug = {
          model,
          ok: true,
          nameLen: nameEn.length,
          ptLen: (parsed.pt?.description || '').length,
          enLen: (parsed.en?.description || '').length,
          jaLen: (parsed.ja?.description || '').length,
        };
        return {
          name_en: nameEn,
          pt: { description: parsed.pt?.description || '' },
          en: { description: parsed.en?.description || '' },
          ja: { description: parsed.ja?.description || '' },
        };
      }
    } catch { /* tenta próximo modelo */ }
  }
  return null;
}

function stripAccents(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function hasPortugueseProductWords(name) {
  const n = stripAccents(name).toLowerCase();
  return /\b(limpeza|profunda|protetor|solar|locao|hidratante|oleo|sabonete|creme|essencia|clareador|maquiagem|acido|hialuronico|vitamina|pele|cabelo)\b/.test(n);
}

function looksEnglishProductName(name) {
  const s = String(name || '').trim();
  return !!s && /[A-Za-z0-9]/.test(s) && !hasJapanese(s) && !hasPortugueseProductWords(s);
}

function localEnglishName(...parts) {
  const n = stripAccents(parts.join(' ')).toLowerCase();
  const original = parts.join(' ');

  if (/肌ラボ|ハダラボ|hada\s*labo|gokujyun|gokujun|goku-jyun/.test(original) || /hada\s*labo|gokujyun|gokujun|goku-jyun/.test(n)) {
    if (/premium|プレミアム/.test(original) || /premium/.test(n)) return 'Hada Labo Gokujyun Premium Hyaluronic Acid Lotion';
    if (/化粧水|lotion|toner|locao/.test(original) || /lotion|toner|locao/.test(n)) return 'Hada Labo Gokujyun Hyaluronic Acid Lotion';
    return 'Hada Labo Gokujyun';
  }

  if (/ビオレ|biore/.test(original) || /biore/.test(n)) {
    if (/ウォータリーエッセンス|watery\s*essence/.test(original) || /watery\s*essence/.test(n)) return 'Biore UV Aqua Rich Watery Essence';
    if (/ライトアップエッセンス|light\s*up/.test(original) || /light\s*up/.test(n)) return 'Biore UV Aqua Rich Light Up Essence';
    if (/アクアリッチ|aqua\s*rich|uv/.test(original) || /aqua\s*rich|uv/.test(n)) return 'Biore UV Aqua Rich';
  }

  if (/dhc/i.test(original) && (/ディープクレンジング|クレンジングオイル|deep\s*cleansing|limpeza\s*profunda|cleansing\s*oil/.test(original) || /deep\s*cleansing|limpeza\s*profunda|cleansing\s*oil/.test(n))) {
    return 'DHC Deep Cleansing Oil';
  }

  if (/メラノcc|melano\s*cc/.test(original) || /melano\s*cc/.test(n)) return 'Melano CC Vitamin C Brightening Essence';
  if (/専科|senka|shiseido/.test(original) || /senka|shiseido/.test(n)) return 'Shiseido Senka';
  if (/キットカット|kit\s*kat|kitkat/.test(original) || /kit\s*kat|kitkat/.test(n)) {
    if (/抹茶|matcha|green\s*tea/.test(original) || /matcha|green\s*tea/.test(n)) return 'Nestle KitKat Matcha Green Tea';
    return 'Nestle KitKat';
  }
  if (/ソフティモ|softymo|kose/.test(original) && (/クレンジング|cleansing/.test(original) || /cleansing/.test(n))) {
    return 'Kose Softymo Speedy Cleansing Oil';
  }

  return '';
}

async function buildEnglishName(productName, sourceName, descJa, currentName) {
  const local = localEnglishName(productName, sourceName, descJa);
  if (looksEnglishProductName(currentName)) return currentName.trim().slice(0, 120);
  if (looksEnglishProductName(productName)) return productName.trim().slice(0, 120);

  if (!GROQ_API_KEY) return local;

  const prompt = `Convert the Japanese/Portuguese/romaji product name below into a short commercial ENGLISH product name.
Return ONLY the English name, no quotes, no explanation.
Do not return Japanese. Do not return Portuguese.

Input typed by admin: ${productName || '(empty)'}
Marketplace title from Yahoo/Rakuten: ${sourceName || '(empty)'}
Original product description: ${(descJa || '').slice(0, 900) || '(empty)'}

Examples:
肌ラボ 極潤 化粧水 -> Hada Labo Gokujyun Hyaluronic Acid Lotion
DHC Limpeza Profunda -> DHC Deep Cleansing Oil
ビオレUV アクアリッチ -> Biore UV Aqua Rich
メラノCC -> Melano CC Vitamin C Brightening Essence`;

  for (const model of GROQ_MODELS) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model, max_tokens: 80, temperature: 0.15, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const text = (data?.choices?.[0]?.message?.content || '')
        .trim()
        .replace(/^["'「『]|["'」』]$/g, '')
        .split(/\r?\n/)[0]
        .trim();
      if (looksEnglishProductName(text)) return text.slice(0, 120);
    } catch {}
  }

  return local;
}

// ---- Traduz nome (PT/EN) para termos de busca em JAPONÊS via Groq ----------
function localJapaneseTerms(name) {
  const n = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const terms = [];

  // Hada Labo
  if (/hada\s*labo|gokujyun|gokujun|goku-jyun/.test(n)) {
    if (/lotion|toner|locao|化粧水/.test(n)) terms.push('肌ラボ 極潤 化粧水', 'ロート 肌ラボ 極潤 化粧水');
    terms.push('肌ラボ 極潤', 'ハダラボ ゴクジュン');
  }

  // Biore UV
  if (/biore/.test(n) && /aqua\s*rich/.test(n)) {
    if (/watery\s*essence|water/.test(n)) terms.push('ビオレUV アクアリッチ ウォータリーエッセンス');
    if (/light\s*up/.test(n)) terms.push('ビオレUV アクアリッチ ライトアップエッセンス');
    terms.push('Biore UV アクアリッチ', 'ビオレUV アクアリッチ');
  }

  // DHC
  if (/dhc/.test(n) && /(cleansing|limpeza|oleo|maquiagem)/.test(n))
    terms.push('DHC ディープクレンジングオイル', 'DHC クレンジングオイル');

  // ANESSA (Shiseido)
  if (/anessa/.test(n)) {
    if (/all.?in.?one|beauty\s*pact|pact/.test(n)) terms.push('アネッサ オールインワン ビューティーパクト', '資生堂 アネッサ オールインワン');
    else if (/tone\s*up|brightening/.test(n)) terms.push('アネッサ トーンアップ UV', '資生堂 アネッサ トーンアップ');
    else if (/brush/.test(n)) terms.push('アネッサ ブラッシュオン UV', '資生堂 アネッサ ブラッシュオン');
    else if (/serum/.test(n)) terms.push('アネッサ デイセラム', '資生堂 アネッサ 美容液');
    else if (/perfect/.test(n)) terms.push('アネッサ パーフェクトUV', '資生堂 アネッサ パーフェクト');
    else if (/mild|baby/.test(n)) terms.push('アネッサ マイルドUV', '資生堂 アネッサ マイルド');
    else if (/men/.test(n)) terms.push('アネッサ メンズ UV', '資生堂 アネッサ メン');
    terms.push('アネッサ', '資生堂 アネッサ');
  }

  // Elixir (Shiseido)
  if (/elixir/.test(n)) {
    if (/whitening|white/.test(n)) terms.push('エリクシール ホワイト', '資生堂 エリクシール ホワイト');
    else if (/superieur|superior/.test(n)) terms.push('エリクシール シュペリエル', '資生堂 エリクシール シュペリエル');
    terms.push('エリクシール', '資生堂 エリクシール');
  }

  // Maquillage (Shiseido)
  if (/maquillage/.test(n)) {
    if (/skin\s*sensor/.test(n)) terms.push('マキアージュ ドラマティックスキンセンサーベース');
    else if (/powdery/.test(n)) terms.push('マキアージュ ドラマティックパウダリー');
    terms.push('マキアージュ', '資生堂 マキアージュ');
  }

  // Shiseido geral / Senka / d program
  if (/shiseido/.test(n) && !/anessa|elixir|maquillage/.test(n)) terms.push('資生堂');
  if (/senka/.test(n)) terms.push('専科', '資生堂 専科');
  if (/d[\s-]?program/.test(n)) terms.push('dプログラム', '資生堂 dプログラム');

  // Kose / Sekkisei / Softymo
  if (/softymo/.test(n)) terms.push('ソフティモ クレンジングオイル', 'コーセー ソフティモ');
  if (/sekkisei/.test(n)) terms.push('雪肌精', 'コーセー 雪肌精');
  if (/kose/.test(n)) terms.push('コーセー');

  // Melano CC / Rohto / Obagi
  if (/melano\s*cc/.test(n)) terms.push('メラノCC', 'ロート メラノCC');
  if (/obagi/.test(n)) terms.push('オバジ', 'ロート オバジ');

  // Curel (Kao)
  if (/curel/.test(n)) {
    if (/uv|sunscreen/.test(n)) terms.push('キュレル UV', '花王 キュレル UV');
    terms.push('キュレル', '花王 キュレル');
  }

  // Nivea
  if (/nivea/.test(n)) {
    if (/sun|uv/.test(n)) terms.push('ニベア サン', 'ニベアUV');
    terms.push('ニベア');
  }

  // SK-II
  if (/sk[\s-]?ii|sk2/.test(n)) {
    if (/treatment\s*essence|facial/.test(n)) terms.push('SK-II フェイシャルトリートメントエッセンス');
    terms.push('SK-II', 'SK2');
  }

  // 8x4 / Nivea-Kao
  if (/8[\s×x*]4|eight[\s×x]four/.test(n)) {
    if (/men/.test(n)) terms.push('8×4メン 薬用ボディウォッシュ', '8×4 MEN');
    terms.push('8×4', 'エイトフォー');
  }

  // KitKat
  if (/kit\s*kat|kitkat/.test(n)) {
    if (/matcha|green\s*tea/.test(n)) terms.push('キットカット 抒茶');
    else terms.push('キットカット');
  }

  return uniqueNonEmpty(terms);
}

function parseJapaneseTermList(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const json = raw.match(/\[[\s\S]*\]/)?.[0];
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) return uniqueNonEmpty(parsed).filter(hasJapanese);
    } catch {}
  }

  return uniqueNonEmpty(
    raw.split(/\r?\n|,|、/)
      .map((s) => s.replace(/^[-*\d.)\s]+/, '').replace(/["「」『』\[\]]/g, '').trim())
  ).filter(hasJapanese);
}

async function toJapaneseKeywords(name) {
  if (!GROQ_API_KEY) return [];
  const prompt = `Você é especialista em produtos japoneses vendidos no Yahoo Shopping Japão e Rakuten.
Converta o nome do produto abaixo para 3 a 5 TERMOS DE BUSCA em japonês (katakana/kanji) usados nas lojas.

Regras OBRIGATÓRIAS:
- Converta o nome comercial em inglês/romaji para o nome japonês OFICIAL da marca (não invente transliteração).
- Shiseido: ANESSA→アネッサ, Elixir→エリクシール, Maquillage→マキアージュ, Senka→専科, d program→dプログラム.
- Kao: Biore→ビオレ, Curel→キュレル, 8x4→8×4.
- Kose: Softymo→ソフティモ, Sekkisei→雪肌精.
- Rohto: Melano CC→メラノCC, Obagi→オバジ, Hada Labo→肌ラボ.
- Inclua sempre o nome da empresa fabricante japonesa quando relevante (資生堂, 花王, コーセー, ロート).
- Para tipos de produto: pact→パクト, foundation→ファンデーション, lotion→化粧水, serum→美容液, sunscreen→日焼け止め, cleansing oil→クレンジングオイル, body wash→ボディウォッシュ, shampoo→シャンプー, conditioner→コンディショナー.
- Retorne variações do mais específico ao mais genérico.

Exemplos:
"ANESSA All-in-One Beauty Pact" → ["アネッサ オールインワン ビューティーパクト","資生堂 アネッサ オールインワン","アネッサ パクト"]
"ANESSA Perfect UV Sunscreen Skincare Milk" → ["アネッサ パーフェクトUV スキンケアミルク","資生堂 アネッサ パーフェクトUV","アネッサ 日焼け止め"]
"Hada Labo Gokujyun Lotion" → ["肌ラボ 極潤 化粧水","ロート 肌ラボ 極潤 化粧水","ハダラボ ゴクジュン 化粧水"]
"Biore UV Aqua Rich Watery Essence" → ["ビオレUV アクアリッチ ウォータリーエッセンス","花王 ビオレUV アクアリッチ"]
"DHC Deep Cleansing Oil" → ["DHC ディープクレンジングオイル","DHC クレンジングオイル"]
"Elixir Superieur Day Care Revolution" → ["エリクシール シュペリエル デイケアレボリューション","資生堂 エリクシール シュペリエル"]
"Sabonete Corporal 8x4 MEN Foot + Body" → ["8×4メン 薬用ボディウォッシュ","8×4 MEN フット ボディ","エイトフォー メン"]

Responda APENAS com um JSON array de strings (sem markdown, sem explicação).
Produto: "${name}"`;
  for (const model of GROQ_MODELS) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model, max_tokens: 250, temperature: 0.15, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const terms = parseJapaneseTermList(data?.choices?.[0]?.message?.content || '');
      if (terms.length) return terms.slice(0, 5);
    } catch {}
  }
  return [];
}

// ---- OCR via imagem: extrai nome japonês do produto a partir da foto --------
async function ocrImageForJapaneseName(imageUrl) {
  if (!GROQ_API_KEY || !imageUrl) return null;
  // Groq suporta visão apenas em alguns modelos — tenta llama-4-scout ou llama-4-maverick
  const visionModels = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'];
  const prompt = 'Esta é a foto de um produto japonês. Leia o texto em japonês (katakana/kanji/hiragana) que aparece na embalagem e retorne: 1) o nome completo do produto em japonês exatamente como aparece na embalagem, 2) o nome da marca. Responda APENAS com JSON: {"name_ja":"","brand_ja":""}';
  for (const model of visionModels) {
    try {
      const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model,
          max_tokens: 150,
          temperature: 0.1,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              { type: 'text', text: prompt },
            ],
          }],
        }),
      }, {}, 12000);
      if (!r.ok) continue;
      const data = await r.json();
      const text = (data?.choices?.[0]?.message?.content || '').trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const parsed = JSON.parse(m[0]);
      const nameJa = (parsed.name_ja || '').trim();
      const brandJa = (parsed.brand_ja || '').trim();
      if (hasJapanese(nameJa)) return { nameJa, brandJa };
    } catch {}
  }
  return null;
}

// ---- Estimativa de preço via IA (fallback sem Rakuten) ---------------------
async function estimatePriceAI(productName) {
  if (!GROQ_API_KEY) return 0;
  const prompt = `Qual o preço de varejo médio em ienes japoneses (¥) do produto "${productName}" vendido no Japão? Responda APENAS com o número inteiro, sem texto, sem símbolo. Exemplo: 1280`;
  for (const model of GROQ_MODELS) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body:    JSON.stringify({ model, max_tokens: 20, temperature: 0.1,
          messages: [{ role: 'user', content: prompt }] }),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const text = (data?.choices?.[0]?.message?.content || '').replace(/[^0-9]/g, '');
      const p    = parseInt(text, 10);
      if (p > 0) return p;
    } catch {}
  }
  return 0;
}

function chooseEnglishName(...candidates) {
  for (const candidate of candidates) {
    const name = String(candidate || '').trim();
    if (!looksEnglishProductName(name)) continue;
    return name.slice(0, 120);
  }
  return '';
}

// ---- Handler principal -----------------------------------------------------
export default async function handler(req, res) {
  const origin = req.headers['origin'] || '';
  const isAllowedOrigin = VALID_ORIGINS.some(o => origin.startsWith(o));

  if (origin && !isAllowedOrigin) {
    res.status(403).json({ error: 'Origem não autorizada' });
    return;
  }
  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Muitas requisições. Aguarde um momento.' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  // Barreira básica: apenas sessões admin chamam este endpoint
  if (body.isAdmin !== true) {
    res.status(403).json({ error: 'Acesso restrito a administradores.' });
    return;
  }

  const productName = typeof body.productName === 'string'
    ? body.productName.trim().slice(0, 200) : '';
  if (!productName) {
    res.status(400).json({ error: 'productName obrigatório' });
    return;
  }

  const targetLang = ['pt', 'en', 'ja'].includes(body.targetLang)
    ? body.targetLang : 'pt';
  const markup = typeof body.markup === 'number' ? body.markup : 1.5; // padrão 50%

  // Campos solicitados (todos ativos por padrão para retrocompatibilidade)
  const reqFields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  const wantPrice = reqFields.price !== false;
  const wantImages = reqFields.images !== false;
  const wantDescription = reqFields.description !== false;
  const wantWeight = reqFields.weight !== false;
  const needMarketplace = wantPrice || wantImages || wantDescription || wantWeight;

  // OCR da imagem (opcional) — URL de imagem existente do produto
  const imageUrl = typeof body.imageUrl === 'string' && body.imageUrl.startsWith('http')
    ? body.imageUrl : null;

  try {
    // 0. Monta termos de busca: local hardcoded + IA + OCR da imagem
    const localTerms = hasJapanese(productName) ? [] : localJapaneseTerms(productName);
    const aiTerms = hasJapanese(productName) ? [] : await toJapaneseKeywords(productName);

    // OCR: só roda se não achou termos japoneses ainda e tem imagem
    let ocrTerms = [];
    if (!localTerms.length && !aiTerms.length && imageUrl) {
      const ocr = await ocrImageForJapaneseName(imageUrl);
      if (ocr?.nameJa) ocrTerms = [ocr.nameJa, ocr.brandJa].filter(hasJapanese);
    }

    const terms = uniqueNonEmpty([productName, ...localTerms, ...aiTerms, ...ocrTerms]).slice(0, 10);

    // 1. Busca a fonte real: tenta cada termo no Yahoo → Rakuten até achar.
    let rakuten = null;
    let searchTerm = productName;
    if (needMarketplace) {
      for (const term of terms) {
        rakuten = (await searchYahoo(term)) || (await searchRakuten(term));
        if (rakuten) { searchTerm = term; break; }
      }
    }

    // 2. Preço de custo
    let costYen = 0;
    if (wantPrice) {
      costYen = rakuten?.priceYen || 0;
      if (!costYen) costYen = await estimatePriceAI(productName);
    }

    // 3. Nome em INGLÊS + descrição traduzida (a partir da descrição real do Yahoo)
    let enrich = null;
    let i18n = null;
    let description = '';
    let generatedNameEn = '';
    if (wantDescription) {
      enrich = await buildI18n(productName, rakuten?.descJa || '');
      i18n = enrich
        ? { pt: enrich.pt, en: enrich.en, ja: enrich.ja }
        : null;
      description = i18n?.[targetLang]?.description
        || await buildDescription(productName, rakuten?.descJa || '', targetLang);
      if (!i18n && description) {
        i18n = { [targetLang]: { description } };
      }
      generatedNameEn = await buildEnglishName(productName, rakuten?.suggestName || '', rakuten?.descJa || '', enrich?.name_en || '');
    }
    const descriptionBaseSource = rakuten?.descSource || (rakuten ? 'marketplace-empty-description' : 'no-marketplace-result');
    const descriptionMethod = rakuten?.descJa
      ? 'marketplace-description-translated-by-ai'
      : 'ai-generated-without-real-description';
    // Nome final sempre em inglês. A conversão japonesa só é usada para buscar no Yahoo/Rakuten.
    const nameEn = chooseEnglishName(enrich?.name_en, generatedNameEn, localEnglishName(productName, rakuten?.suggestName, rakuten?.descJa), productName, rakuten?.suggestName)
      || generatedNameEn
      || productName;

    // 4. Preço de venda = custo × markup
    const sellingPriceYen = costYen ? Math.round(costYen * markup) : 0;

    // 5. Baixa imagens server-side → base64, evitando bloqueio CORS no browser
    let finalImages = [];
    if (wantImages && rakuten?.images?.length) {
      finalImages = await Promise.all(
        rakuten.images.slice(0, 5).map(async (url) => {
          try {
            const r = await fetchWithTimeout(url, {
              headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://shopping.yahoo.co.jp/' },
            }, 8000);
            if (!r.ok) return url;
            const buf = await r.arrayBuffer();
            const b64 = Buffer.from(buf).toString('base64');
            const ct = r.headers.get('content-type') || 'image/jpeg';
            return `data:${ct};base64,${b64}`;
          } catch {
            return url; // fallback para URL se download falhar
          }
        })
      );
    }

    res.status(200).json({
      description:            wantDescription ? description : undefined,
      descriptionBaseSource,
      descriptionMethod,
      i18n:                   wantDescription ? i18n : undefined,
      costYen:                wantPrice ? costYen : undefined,
      sellingPriceYen:        wantPrice ? sellingPriceYen : undefined,
      packageDimensionsCm:    rakuten?.packageDimensionsCm || null,
      // +50% sobre o peso encontrado para compensar embalagem/frasco não declarado
      weightGrams:            wantWeight && rakuten?.weightGrams
                                ? Math.round(rakuten.weightGrams * 1.5)
                                : (wantWeight ? null : undefined),
      images:                 wantImages ? finalImages : [],
      suggestName: nameEn,
      source:      rakuten?.source || 'ai',
      ...(body.debug === true ? { rakutenDebug: lastRakutenDebug, yahooDebug, searchTerm, searchTerms: terms, generatedNameEn, i18nDebug } : {}),
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
