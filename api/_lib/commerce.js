import { earnedPointsForOrder, pointsMultiplierForSpend } from '../../shared/points.js';
import { LOYALTY_POINTS_ENABLED } from '../../shared/featureFlags.js';
import { packedWeightG, parcelWeightG, productPackedWeightG } from '../../shared/weight.js';
import { roundYen } from '../../shared/pricing.js';
import { HttpError } from './http.js';
import { currencyForCountry } from './fx.js';
import { convertYen, normalizeMoney, couponDiscountYen as couponDiscountYenOf, settleCheckout } from '../../shared/checkout-totals.js';

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
const EMS_BRACKETS = [500,600,700,800,900,1000,1250,1500,1750,2000,2500,3000,3500,4000,4500,5000,5500,6000,7000,8000,9000,10000,11000,12000,13000,14000,15000,16000,17000,18000,19000,20000,21000,22000,23000,24000,25000,26000,27000,28000,29000,30000];
const EMS = {
  1: [1450,1600,1750,1900,2050,2200,2500,2800,3100,3400,3900,4400,4900,5400,5900,6400,6900,7400,8200,9000,9800,10600,11400,12200,13000,13800,14600,15400,16200,17000,17800,18600,19400,20200,21000,21800,22600,23400,24200,25000,25800,26600],
  2: [1900,2150,2400,2650,2900,3150,3500,3850,4200,4550,5150,5750,6350,6950,7550,8150,8750,9350,10350,11350,12350,13350,14350,15350,16350,17350,18350,19350,20350,21350,22350,23350,24350,25350,26350,27350,28350,29350,30350,31350,32350,33350],
  3: [3150,3400,3650,3900,4150,4400,5000,5550,6150,6700,7750,8800,9850,10900,11950,13000,14050,15100,17200,19300,21400,23500,25600,27700,29800,31900,34000,36100,38200,40300,42400,44500,46600,48700,50800,52900,55000,57100,59200,61300,63400,65500],
  4: [3900,4180,4460,4740,5020,5300,5990,6600,7290,7900,9100,10300,11500,12700,13900,15100,16300,17500,19900,22300,24700,27100,29500,31900,34300,36700,39100,41500,43900,46300,48700,51100,53500,55900,58300,60700,63100,65500,67900,70300,72700,75100],
  5: [3600,3900,4200,4500,4800,5100,5850,6600,7350,8100,9600,11100,12600,14100,15600,17100,18600,20100,22500,24900,27300,29700,32100,34500,36900,39300,41700,44100,46500,48900,51300,53700,56100,58500,60900,63300,65700,68100,70500,72900,75300,77700],
};
const DOMESTIC_RATES = {
  yuubin: { 60: { 1: 870, 2: 970, 3: 1100, 4: 1350 }, 80: { 1: 1100, 2: 1200, 3: 1400, 4: 1700 } },
  yamato: { 60: { 1: 930, 2: 1040, 3: 1150, 4: 1480 }, 80: { 1: 1150, 2: 1260, 3: 1370, 4: 1810 } },
  sagawa: { 60: { 1: 880, 2: 990, 3: 1100, 4: 1430 }, 80: { 1: 1100, 2: 1210, 3: 1430, 4: 1760 } },
};
// Zonas por distância em linha reta a partir de Tsu-shi (Mie-ken). Espelho de
// src/data/japanPrefectures.ts: mesma prefeitura, mesma zona nos dois lados.
const DOMESTIC_ZONE = new Map([
  ...['Mie','Aichi','Gifu','Shiga','Kyoto','Nara','Osaka','Hyogo','Wakayama'].map((name) => [name, 1]),
  ...['Fukui','Shizuoka','Ishikawa','Toyama','Yamanashi','Nagano','Tottori','Okayama','Kagawa','Tokushima'].map((name) => [name, 2]),
  ...['Tokyo','Kanagawa','Saitama','Chiba','Gunma','Tochigi','Ibaraki','Niigata','Hiroshima','Shimane','Yamaguchi','Ehime','Kochi'].map((name) => [name, 3]),
  ...['Fukuoka','Saga','Nagasaki','Kumamoto','Oita','Miyazaki','Kagoshima','Fukushima','Yamagata','Miyagi','Akita','Iwate','Aomori','Hokkaido','Okinawa'].map((name) => [name, 4]),
]);
const COUNTRY_CONFIG = new Map([
  ['Brasil', { currency: 'BRL', zone: 5, vat: .17 }],
  ['Japão', { currency: 'JPY', zone: 1, vat: 0 }],
  ['Portugal', { currency: 'EUR', zone: 3, vat: .23 }],
  ['França', { currency: 'EUR', zone: 3, vat: .20 }],
  ['Itália', { currency: 'EUR', zone: 3, vat: .22 }],
  ['Espanha', { currency: 'EUR', zone: 3, vat: .21 }],
  ['Estados Unidos', { currency: 'USD', zone: 4, vat: 0 }],
  ['Canadá', { currency: 'USD', zone: 3, vat: .13 }],
  ['México', { currency: 'USD', zone: 3, vat: .16 }],
  ['Argentina', { currency: 'USD', zone: 5, vat: .21 }],
  ['Chile', { currency: 'USD', zone: 5, vat: .19 }],
  ['Colômbia', { currency: 'USD', zone: 5, vat: .19 }],
  ['Peru', { currency: 'USD', zone: 5, vat: .18 }],
  ['Uruguai', { currency: 'USD', zone: 5, vat: .22 }],
  ['Reino Unido', { currency: 'USD', zone: 3, vat: .20 }],
  ['Alemanha', { currency: 'EUR', zone: 3, vat: .19 }],
  ['Países Baixos', { currency: 'EUR', zone: 3, vat: .21 }],
  ['Bélgica', { currency: 'EUR', zone: 3, vat: .21 }],
  ['Suíça', { currency: 'USD', zone: 3, vat: .077 }],
  ['Suécia', { currency: 'USD', zone: 3, vat: .25 }],
  ['Noruega', { currency: 'USD', zone: 3, vat: .25 }],
  ['Irlanda', { currency: 'EUR', zone: 3, vat: .23 }],
  ['Áustria', { currency: 'EUR', zone: 3, vat: .20 }],
  ['Polônia', { currency: 'USD', zone: 3, vat: .23 }],
  ['China', { currency: 'USD', zone: 1, vat: .13 }],
  ['Coreia do Sul', { currency: 'USD', zone: 1, vat: .10 }],
  ['Taiwan', { currency: 'USD', zone: 1, vat: .05 }],
  ['Cingapura', { currency: 'USD', zone: 2, vat: .09 }],
  ['Tailândia', { currency: 'USD', zone: 2, vat: .07 }],
  ['Malásia', { currency: 'USD', zone: 2, vat: .10 }],
  ['Filipinas', { currency: 'USD', zone: 2, vat: .12 }],
  ['Indonésia', { currency: 'USD', zone: 2, vat: .11 }],
  ['Vietnã', { currency: 'USD', zone: 2, vat: .10 }],
  ['Índia', { currency: 'USD', zone: 2, vat: .18 }],
  ['Hong Kong', { currency: 'USD', zone: 2, vat: 0 }],
  ['Austrália', { currency: 'USD', zone: 3, vat: .10 }],
  ['Nova Zelândia', { currency: 'USD', zone: 3, vat: .15 }],
  ['Emirados Árabes', { currency: 'USD', zone: 3, vat: .05 }],
  ['Israel', { currency: 'USD', zone: 3, vat: .17 }],
  ['Arábia Saudita', { currency: 'USD', zone: 3, vat: .15 }],
  ['Turquia', { currency: 'USD', zone: 3, vat: .20 }],
  ['África do Sul', { currency: 'USD', zone: 5, vat: .15 }],
  ['Angola', { currency: 'USD', zone: 5, vat: .14 }],
  ['Moçambique', { currency: 'USD', zone: 5, vat: .16 }],
]);
const US_TAX = { AL:.0924,AK:.0176,AZ:.0838,AR:.0947,CA:.0882,CO:.0777,CT:.0635,DE:0,FL:.0702,GA:.0735,HI:.0444,ID:.0603,IL:.0888,IN:.07,IA:.0694,KS:.0869,KY:.06,LA:.0955,ME:.055,MD:.06,MA:.0625,MI:.06,MN:.0749,MS:.07,MO:.0825,MT:0,NE:.0694,NV:.0823,NH:0,NJ:.066,NM:.0762,NY:.0852,NC:.0698,ND:.0697,OH:.0723,OK:.0899,OR:0,PA:.0634,RI:.07,SC:.0744,SD:.064,TN:.0955,TX:.082,UT:.0719,VT:.0624,VA:.0573,WA:.0938,WV:.0656,WI:.0543,WY:.0536,DC:.06 };

export { roundYen };

function baseYen(product, variantId) {
  const variants = Array.isArray(product.variants) && product.variants.length
    ? product.variants
    : [
        product.prices?.small ? { id: 'small', price: product.prices.small } : null,
        product.prices?.large ? { id: 'large', price: product.prices.large } : null,
      ].filter(Boolean);
  const variant = variants.find((entry) => entry.id === variantId);
  if (!variant || !(Number(variant.price) > 0)) throw new HttpError(400, 'invalid_variant');
  return roundYen(variant.price);
}

function discountedYen(product, variantId, campaign) {
  const base = baseYen(product, variantId);
  const productDiscount = Number(product.discountPercent || 0);
  let percent = productDiscount > 0 && productDiscount < 100 ? productDiscount : 0;
  if (campaign?.mechanic === 'discount') {
    percent = campaign.keepProductDiscount ? Math.min(90, percent + Number(campaign.discountPct || 0)) : Number(campaign.discountPct || 0);
  } else if (campaign && !campaign.keepProductDiscount) {
    percent = 0;
  }
  return percent > 0 ? roundYen(base * (1 - percent / 100)) : base;
}

function dimensions(product) {
  const raw = product.packageDimensionsCm;
  if (!raw) return null;
  const values = [Number(raw.widthCm), Number(raw.lengthCm), Number(raw.heightCm)];
  if (!values.every((value) => Number.isFinite(value) && value > 0 && value <= 80)) return null;
  if (values.reduce((sum, value) => sum + value, 0) + 15 > 145) return null;
  return values;
}

function shippingShape(items) {
  let totalWeightG = 0;
  let knownQuantity = 0;
  let missingEquivalent = 0;
  let volume = 0;
  let maxSum = 0;
  for (const item of items) {
    const dims = dimensions(item.product);
    const weight = productPackedWeightG(item.product);
    if (weight > 0) totalWeightG += weight * item.quantity;
    else {
      const estimatedWeight = dims
        ? dims[0] * dims[1] * dims[2] * 0.25
        : item.variantId === 'small' ? 300 : 600;
      totalWeightG += packedWeightG(estimatedWeight) * item.quantity;
    }
    if (!dims) {
      missingEquivalent += (item.variantId === 'small' ? 1 : 2) * item.quantity;
      continue;
    }
    knownQuantity += item.quantity;
    const padded = dims.map((value) => value + 5);
    maxSum = Math.max(maxSum, padded.reduce((sum, value) => sum + value, 0));
    volume += padded.reduce((product, value) => product * value, 1) * item.quantity;
  }
  // Mais a caixa com plástico-bolha, uma vez por pacote (igual ao carrinho).
  totalWeightG = Math.max(100, parcelWeightG(totalWeightG));
  let boxes60 = 0;
  let boxes80 = 0;
  if (knownQuantity === 0) {
    if (missingEquivalent <= 4) boxes60 = 1;
    else if (missingEquivalent <= 6) boxes80 = 1;
    else if (missingEquivalent <= 8) boxes60 = 2;
    else {
      boxes80 = Math.floor(missingEquivalent / 6);
      boxes60 = missingEquivalent % 6 ? Math.ceil((missingEquivalent % 6) / 4) : 0;
    }
  } else {
    if (missingEquivalent) {
      volume += (8000 / 4) * missingEquivalent;
      maxSum = Math.max(maxSum, 60);
    }
    if (maxSum <= 60) boxes60 = Math.max(1, Math.ceil(volume / 8000));
    else boxes80 = Math.max(1, Math.ceil(volume / (Math.pow(80 / 3, 3))));
  }
  return { totalWeightG, boxes60, boxes80, maxSum };
}

/** Tarifa EMS (¥) para o peso já embalado. `null` acima de 30 kg. */
export function emsRateYen(weightG, zone) {
  const index = EMS_BRACKETS.findIndex((bracket) => weightG <= bracket);
  return index >= 0 ? (EMS[zone]?.[index] ?? null) : null;
}

function internationalZone(country) {
  const config = COUNTRY_CONFIG.get(country);
  if (!config) throw new HttpError(400, 'unsupported_country');
  return config.zone;
}

function shippingYen(items, country, prefecture, carrier) {
  const shape = shippingShape(items);
  if (shape.totalWeightG > 30000 || shape.maxSum > 150) throw new HttpError(409, 'shipping_unavailable');
  if (country === 'Japão') {
    const zone = DOMESTIC_ZONE.get(prefecture);
    const rates = DOMESTIC_RATES[carrier];
    if (!zone || !rates) throw new HttpError(400, 'invalid_shipping');
    const amount = (rates[60][zone] * shape.boxes60) + (rates[80][zone] * shape.boxes80) || rates[60][zone];
    return { amount, weightG: shape.totalWeightG };
  }
  const zone = internationalZone(country);
  // EUA: mercadoria só sai com imposto pré-pago (DDP), e o único serviço com
  // DDP confirmado para lojas é o EMS. Air Packet e Kozutsumi ficam de fora.
  if (country === 'Estados Unidos' && carrier !== 'ems') throw new HttpError(409, 'shipping_unavailable');
  let amount = null;
  if (carrier === 'eraito' && shape.totalWeightG <= 2000) amount = E_LIGHT[zone][Math.ceil(shape.totalWeightG / 100) - 1];
  if (carrier === 'kozutsumi-air' && shape.totalWeightG > 2000) amount = AIR_PARCEL[zone][Math.ceil(shape.totalWeightG / 1000) - 1];
  if (carrier === 'ems') amount = emsRateYen(shape.totalWeightG, zone);
  if (!(amount > 0)) throw new HttpError(400, 'invalid_shipping');
  return { amount, weightG: shape.totalWeightG };
}

function displayTax(amount, country, state) {
  if (country === 'Brasil') {
    const federal = amount < 250 ? amount * 0.20 : Math.max(0, amount * 0.60 - 62.50);
    return federal + (amount + federal) * 0.17;
  }
  if (country === 'Estados Unidos') return amount * (US_TAX[String(state || '').toUpperCase()] ?? 0.0699);
  const config = COUNTRY_CONFIG.get(country);
  if (!config) throw new HttpError(400, 'unsupported_country');
  return amount * config.vat;
}


export function buildQuote({ requestedItems, products, country, prefecture, state, carrier, paymentMethod, coupon, redeemPoints, negotiation, campaign, homePromotion, rates, recentSpendYen = 0, psFeeWaived = false }) {
  const now = Date.now();
  if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 100) throw new HttpError(400, 'invalid_items');
  const lineItems = [];
  let homePromoQuantity = 0;
  for (const requested of requestedItems) {
    const quantity = Number(requested.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new HttpError(400, 'invalid_quantity');
    const requestedId = String(requested.productId || '');
    const isHomePromo = requestedId.endsWith('_promo');
    const productId = isHomePromo ? requestedId.replace(/_promo$/, '') : requestedId;
    const product = products.get(productId);
    if (!product || product.hidden === true) throw new HttpError(400, 'invalid_product');
    if (product.deliveryRestrict === 'japan-only' && country !== 'Japão') throw new HttpError(400, 'product_unavailable');
    if (product.deliveryRestrict === 'exterior-only' && country === 'Japão') throw new HttpError(400, 'product_unavailable');
    const variantId = String(requested.variantId || requested.size || 'small');
    let unitYen;
    if (isHomePromo) {
      if (!homePromotion || homePromotion.productId !== productId || (homePromotion.expiresAt && homePromotion.expiresAt <= now)) throw new HttpError(409, 'promotion_unavailable');
      const limit = Number(homePromotion.limitPerPerson || 1);
      if (quantity > limit) throw new HttpError(409, 'promotion_limit');
      const remaining = homePromotion.maxProducts == null
        ? Infinity
        : Number(homePromotion.maxProducts) - Number(homePromotion.soldCount || 0) - Number(homePromotion.reservedCount || 0);
      if (quantity > remaining) throw new HttpError(409, 'promotion_unavailable');
      unitYen = roundYen(homePromotion.promoPriceYen);
      homePromoQuantity += quantity;
    } else {
      const applies = campaign?.productId === productId ? campaign : null;
      unitYen = discountedYen(product, variantId, applies);
    }
    lineItems.push({ productId, requestedId, product, variantId, quantity, unitYen, homePromo: isHomePromo, freeGift: false });
  }

  if (campaign && (campaign.mechanic === 'bogo' || campaign.mechanic === 'bogo_other')) {
    const trigger = lineItems.find((item) => item.productId === campaign.productId && !item.freeGift);
    if (trigger) {
      const giftId = campaign.mechanic === 'bogo' ? campaign.productId : campaign.giftProductId;
      const giftProduct = products.get(giftId);
      if (!giftProduct) throw new HttpError(409, 'promotion_unavailable');
      const giftVariant = trigger.productId === giftId ? trigger.variantId : (giftProduct.variants?.[0]?.id || 'small');
      lineItems.push({ productId: giftId, requestedId: giftId, product: giftProduct, variantId: giftVariant, quantity: trigger.quantity, unitYen: 0, homePromo: false, freeGift: true });
    }
  }

  const productSubtotalYen = lineItems.reduce((sum, item) => sum + item.unitYen * item.quantity, 0);
  const regularSubtotalYen = lineItems.filter((item) => !item.homePromo && !item.freeGift).reduce((sum, item) => sum + item.unitYen * item.quantity, 0);
  if (coupon && coupon.minOrderValue && productSubtotalYen < Number(coupon.minOrderValue)) throw new HttpError(409, 'coupon_minimum_not_met');
  const couponDiscountYen = couponDiscountYenOf(regularSubtotalYen, coupon);

  const approved = negotiation?.status === 'approved'
    && negotiation.approvedBy
    && negotiation.approvedBy !== 'auto'
    && (!negotiation.expiresAt || new Date(negotiation.expiresAt).getTime() > now);
  const negotiatedPsDiscountRaw = approved && negotiation.type === 'ps_fee'
    ? Number(negotiation.approvedDiscountYen || 0)
    : 0;
  const shipping = shippingYen(lineItems, country, prefecture, carrier);
  const shippingDiscountYen = approved && negotiation.type === 'shipping' ? Math.min(shipping.amount, Number(negotiation.approvedDiscountYen || 0)) : 0;
  const finalShippingYen = Math.max(0, shipping.amount - shippingDiscountYen);
  const currency = currencyForCountry(country);

  // A conta do dinheiro fica em shared/checkout-totals.js (mesma do cliente).
  const settled = settleCheckout({
    lines: lineItems.map((item) => ({ unitYen: item.unitYen, quantity: item.quantity, freeGift: item.freeGift, homePromo: item.homePromo, noPsFee: item.product.noPsFee })),
    couponDiscountYen,
    redeemPoints,
    paymentMethod,
    currency,
    rates,
    finalShippingYen,
    psFeeWaived,
    negotiatedPsDiscountYen: negotiatedPsDiscountRaw,
  });
  const {
    netProductsYen,
    pointsDiscountYen,
    psFeeWaiverApplied,
    total,
    totalYen,
    display,
  } = settled;
  const psFeeYenCharged = settled.psFeeYenCharged;
  const productsDisplay = display.products;
  // Imposto de importação é estimado só para informar o cliente — é cobrado
  // pela alfândega/transportadora na entrega, nunca pela loja. Por isso NÃO
  // entra no total cobrado (Stripe usa `total` como valor da cobrança em
  // `api/orders.js`); a tela de checkout já dizia isso em texto
  // ("Ele NÃO foi somado ao total pago no site") mas o servidor cobrava com
  // imposto embutido mesmo assim — overcharge silencioso.
  const taxDisplay = country === 'Japão' ? 0 : normalizeMoney(displayTax(productsDisplay, country, state || prefecture), currency);
  if (!(total > 0)) throw new HttpError(400, 'invalid_total');

  // Pontos da campanha "Compre e Ganhe pontos". Até 04/08/2026 o
  // `fulfillment.js` somava `order.promoPoints` no saldo, mas ninguém gravava
  // esse campo — a campanha era anunciada por e-mail/push e creditava zero.
  //
  // Exige o produto da campanha no carrinho, como as outras mecânicas já
  // fazem (`discount` casa por `productId`, `bogo` procura o item gatilho):
  // senão bastava colar o código com qualquer carrinho para levar os pontos.
  // Brinde não conta como gatilho, pelo mesmo motivo.
  const promoPoints = campaign?.mechanic === 'points'
    && lineItems.some((item) => !item.freeGift && item.productId === campaign.productId)
    ? Math.max(0, Math.floor(Number(campaign.points || 0)))
    : 0;

  const pointsMultiplier = pointsMultiplierForSpend(recentSpendYen);

  return {
    currency,
    total,
    totalYen,
    productSubtotalYen,
    netProductsYen,
    couponDiscountYen,
    pointsDiscountYen,
    redeemPoints: pointsDiscountYen,
    earnedPoints: LOYALTY_POINTS_ENABLED ? earnedPointsForOrder(productSubtotalYen, pointsDiscountYen, pointsMultiplier) : 0,
    pointsMultiplier,
    promoPoints,
    shippingYen: finalShippingYen,
    shippingWeightG: shipping.weightG,
    psFeeYen: psFeeYenCharged,
    psFeeWaiverApplied,
    tax: normalizeMoney(taxDisplay, currency),
    // A conta decomposta, com as linhas já coerentes entre si:
    // `subtotal - couponDiscount - pointsDiscount - paymentDiscount == products`
    // e `products + shipping + psFee == total` (tax é só estimativa exibida,
    // cobrada pela alfândega na entrega — nunca soma no total cobrado). Vai
    // (`orders.js`, campo `priceBreakdown`) para congelar o que o cliente viu no
    // momento da compra — sem isso, uma variação de câmbio depois torna
    // impossível reconstruir a conta numa contestação.
    display: {
      subtotal: display.subtotal,
      couponDiscount: display.couponDiscount,
      pointsDiscount: display.pointsDiscount,
      paymentDiscount: display.paymentDiscount,
      products: display.products,
      shipping: display.shipping,
      psFee: display.psFee,
      tax: taxDisplay,
    },
    homePromoQuantity,
    items: lineItems.map((item) => ({
      productId: item.productId,
      requestedId: item.requestedId,
      productName: String(item.product.name || ''),
      image: item.product.thumbnail || item.product.image || '',
      variantId: item.variantId,
      size: item.variantId,
      quantity: item.quantity,
      unitYen: item.unitYen,
      price: normalizeMoney(convertYen(item.unitYen, currency, rates), currency),
      freeGift: item.freeGift,
      homePromo: item.homePromo,
      stockUnlimited: item.product.stock?.unlimited !== false,
    })),
  };
}
