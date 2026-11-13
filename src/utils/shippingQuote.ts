import type { CartItem } from '@/types';
import { japanPrefectures, japanShippingRates } from '@/data/japanPrefectures';
import { convertYen as fxConvert } from '@/services/fxService';
import { getCurrencyByCountry } from '@/utils/currency';
import { getCountryConfig } from '@/data/worldCountries';
import { calculateCartShippingBoxes, type CartShippingBoxes } from '@/utils/shippingDimensions';
import { getELightRate, getAirParcelRate, getEmsRate, countryToZone, MAX_WEIGHT_G, type JapanPostZone } from '@/utils/japanPostRates';

/**
 * Cotação de frete — FONTE ÚNICA usada pela calculadora do checkout e pelo
 * assistente virtual. Antes cada um tinha sua cópia das regras e elas podiam
 * divergir (o assistente chegou a cotar até 5,6x o valor real).
 */

export interface ShippingQuoteOption {
  carrier: string;
  /** Identificador estável (gravado no pedido). Na tela use t(nameKey). */
  name: string;
  /** Chave de tradução do nome do serviço (src/data/translations.ts). */
  nameKey: string;
  logo: string;
  /** Valor na moeda do destino (¥ no Japão). */
  cost: number;
  /** Valor em ¥ (internacional); null no Japão (cost já é ¥) ou "consultar". */
  costYen: number | null;
  estimatedDays: string;
  /** Sem preço fixo: frete marítimo / "a combinar". */
  isConsultar?: boolean;
  isCombinar?: boolean;
}

export interface ShippingQuote {
  options: ShippingQuoteOption[];
  boxes: CartShippingBoxes;
  currency: 'BRL' | 'JPY' | 'EUR' | 'USD';
  isJapan: boolean;
  isOverweight: boolean;
  /** Japão sem província escolhida: o preço depende da zona de entrega. */
  needsPrefecture: boolean;
  /** País que o servidor não aceita (ex.: "Outros"): não há cotação online. */
  unsupportedCountry: boolean;
}

const US_COUNTRY = 'Estados Unidos';

/** Mesma lista do servidor (api/_lib/commerce.js, COUNTRY_CONFIG). "Outros" é o fallback do cadastro e o servidor recusa (400 unsupported_country). */
export const isServerSupportedCountry = (country: string): boolean =>
  country !== 'Outros' && getCountryConfig(country) !== undefined;
/** EMS com DDP para os EUA: a pré-declaração e a liberação somam dias ao EMS comum. */
const US_DDP_EMS_DAYS = '10-12';

/** Mesmo cálculo de `getSpaceUsed` do carrinho. */
export const spaceUsedOf = (items: CartItem[]) => {
  let small = 0;
  let large = 0;
  for (const item of items) {
    if (item.size === 'small') small += item.quantity;
    else large += item.quantity;
  }
  return { small, large, totalSmallEquivalent: small + large * 2 };
};

// Prazo estimado por zona Japan Post (e-Light / Air / EMS)
const DAYS_BY_ZONE: Record<number, { light: string; air: string; ems: string }> = {
  1: { light: '6-10', air: '4-7', ems: '2-4' }, // China/Coreia/Taiwan
  2: { light: '7-12', air: '5-9', ems: '3-5' }, // Ásia
  3: { light: '7-14', air: '6-10', ems: '4-7' }, // Europa/Oceania
  4: { light: '7-14', air: '6-10', ems: '3-6' }, // EUA
  5: { light: '20-40', air: '10-15', ems: '18' }, // Brasil/Am.Sul/África
};

const JAPAN_CARRIERS = {
  yuubin: { nameKey: 'shipping.svc.yuubin', name: 'Japan Post Local (ゆうパック) ✉️', logo: '📮' },
  yamato: { nameKey: 'shipping.svc.yamato', name: 'Yamato Transport (宅急便) 🐱', logo: '📦' },
  sagawa: { nameKey: 'shipping.svc.sagawa', name: 'Sagawa Express (飛脚宅配便) 🏃‍♂️', logo: '⚡' },
} as const;
const JAPAN_DAYS: Record<number, string> = { 1: '1-2', 2: '1-2', 3: '2-3', 4: '3-4' };

interface QuoteOptions {
  /** Nome da província (só Japão). */
  prefecture?: string;
}

export function quoteShipping(items: CartItem[], destinationCountry: string, { prefecture }: QuoteOptions = {}): ShippingQuote {
  const country = destinationCountry || 'Brasil';
  const supported = isServerSupportedCountry(country);
  const isJapan = country === 'Japão';
  const currency = getCurrencyByCountry(country);
  const jpZone: JapanPostZone = countryToZone(country);
  const boxes = calculateCartShippingBoxes(items, spaceUsedOf(items));
  const hasCustomRequest = items.some((item) => item.product?.id?.includes('custom') || item.product?.category === 'custom-request');

  const isOverweight = !isJapan && boxes.totalWeightG > MAX_WEIGHT_G;

  const base = { boxes, currency, isJapan, isOverweight, unsupportedCountry: !supported };

  if (!supported) return { ...base, options: [], needsPrefecture: false };
  if (items.length === 0) return { ...base, options: [], needsPrefecture: false };

  if (isJapan) {
    const pref = japanPrefectures.find((p) => p.name === prefecture);
    if (!pref) return { ...base, options: [], needsPrefecture: true };
    const zone = pref.zone as 1 | 2 | 3 | 4;
    const options = (Object.keys(JAPAN_CARRIERS) as Array<keyof typeof JAPAN_CARRIERS>).map((carrier) => {
      // Tabela por zona (japanShippingRates). A tabela Yu-Pack por província
      // (shared/yupack.js, saindo de Hiroshima) NÃO foi portada: a origem do
      // NikkeyBox é Mie-ken (ver relatório).
      const rate = (size: '60' | '80'): number => japanShippingRates[carrier][size][zone];
      let totalCost = 0;
      if (boxes.boxes60 > 0) totalCost += rate('60') * boxes.boxes60;
      if (boxes.boxes80 > 0) totalCost += rate('80') * boxes.boxes80;
      if (totalCost === 0) totalCost = rate('60');
      return {
        carrier,
        ...JAPAN_CARRIERS[carrier],
        cost: totalCost,
        costYen: null,
        estimatedDays: JAPAN_DAYS[zone] || '2-3',
      } satisfies ShippingQuoteOption;
    }).sort((a, b) => a.cost - b.cost);
    return { ...base, options, needsPrefecture: false };
  }

  // Internacional — Japan Post por peso
  const weightG = boxes.totalWeightG;
  if (weightG <= 0 || isOverweight) return { ...base, options: [], needsPrefecture: false };
  const zd = DAYS_BY_ZONE[jpZone] || DAYS_BY_ZONE[5];
  const options: ShippingQuoteOption[] = [];

  // EUA: desde 15/10/2026 o Japan Post só aceita mercadoria para os EUA com o
  // imposto pré-pago (DDP), declarado antes por app credenciado. O único
  // serviço com DDP para loja é o EMS, então é a única opção — o servidor
  // recusa as outras (`api/_lib/commerce.js`, `shipping_unavailable`). O
  // imposto entra no total como linha própria (`shared/money.js`).
  if (country === US_COUNTRY) {
    const emsYen = getEmsRate(weightG, jpZone);
    if (emsYen) options.push({
      carrier: 'ems', nameKey: 'shipping.svc.emsDdp', name: 'Japan Post EMS · 国際スピード郵便 (DDP — impostos pré-pagos)', logo: '✈️',
      cost: fxConvert(emsYen, currency), costYen: emsYen, estimatedDays: US_DDP_EMS_DAYS,
    });
    return { ...base, options, needsPrefecture: false };
  }

  if (weightG <= 2000) {
    const eLightYen = getELightRate(weightG, jpZone);
    if (eLightYen) options.push({
      // 国際eパケットライト virou 国際エアパケット (Air Packet) em 01/06/2026.
      carrier: 'eraito', nameKey: 'shipping.svc.airPacket', name: 'Japan Post Air Packet · 国際エアパケット', logo: '📦',
      cost: fxConvert(eLightYen, currency), costYen: eLightYen, estimatedDays: zd.light,
    });
  } else {
    const airYen = getAirParcelRate(weightG, jpZone);
    if (airYen) options.push({
      carrier: 'kozutsumi-air', nameKey: 'shipping.svc.kozutsumiAir', name: 'Japan Post Kozutsumi Air · 国際小包 航空便', logo: '📦',
      cost: fxConvert(airYen, currency), costYen: airYen, estimatedDays: zd.air,
    });
  }

  // EMS para todas as faixas de peso
  const emsYen = getEmsRate(weightG, jpZone);
  if (emsYen) options.push({
    carrier: 'ems', nameKey: 'shipping.svc.ems', name: 'Japan Post EMS · 国際スピード郵便 (via DHL)', logo: '✈️',
    cost: fxConvert(emsYen, currency), costYen: emsYen, estimatedDays: zd.ems,
  });

  // Marítimo — sempre "consultar"
  options.push({
    carrier: 'maritimo', nameKey: 'shippingPage.seaFreight', name: 'Sea Freight · 船便', logo: '🚢',
    cost: 0, costYen: null, estimatedDays: '60-90', isConsultar: true,
  });

  // A combinar — frete após pesagem real (só encomendas personalizadas)
  if (hasCustomRequest) options.push({
    carrier: 'a-combinar', nameKey: 'shipping.svc.combinar', name: 'A Combinar · 要相談 (Apenas para encomendas fora do site)', logo: '⚖️',
    cost: 0, costYen: null, estimatedDays: 'A definir', isConsultar: true, isCombinar: true,
  });

  options.sort((a, b) => {
    if (a.isCombinar) return 1;
    if (b.isCombinar) return -1;
    if (a.isConsultar) return 1;
    if (b.isConsultar) return -1;
    return a.cost - b.cost;
  });
  return { ...base, options, needsPrefecture: false };
}
