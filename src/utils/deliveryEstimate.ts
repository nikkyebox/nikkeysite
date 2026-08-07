import { countryToZone, JapanPostZone } from '@/utils/japanPostRates';

export interface DeliveryEstimate {
  minDays: number;
  maxDays: number;
  isDomestic: boolean;
}

/**
 * Estimativa de prazo de entrega (dias úteis) por país/zona do Japan Post.
 * Combina o prazo médio real do EMS/e-Packet com um buffer de alfândega e
 * manuseio. É um indicador exibido na página do produto — não substitui o
 * cálculo exato de frete feito no carrinho.
 *
 * Zonas Japan Post:
 *  1 = China, Coreia, Taiwan
 *  2 = Ásia (exceto zona 1)
 *  3 = Europa, Oceania, Canadá, México, Oriente Médio
 *  4 = EUA, Guam
 *  5 = América do Sul (Brasil), América Central, África
 */
const ZONE_ESTIMATES: Record<JapanPostZone, DeliveryEstimate> = {
  1: { minDays: 4, maxDays: 9, isDomestic: false },
  2: { minDays: 5, maxDays: 11, isDomestic: false },
  3: { minDays: 7, maxDays: 16, isDomestic: false },
  4: { minDays: 6, maxDays: 13, isDomestic: false },
  5: { minDays: 10, maxDays: 25, isDomestic: false },
};

export function getDeliveryEstimate(country: string): DeliveryEstimate {
  if (!country || country === 'Japão') {
    return { minDays: 1, maxDays: 4, isDomestic: true };
  }
  const zone = countryToZone(country);
  return ZONE_ESTIMATES[zone];
}

export function formatDeliveryRange(est: DeliveryEstimate): string {
  if (est.minDays === est.maxDays) return `${est.minDays} dias úteis`;
  return `${est.minDays}–${est.maxDays} dias úteis`;
}
