import { packedWeightG } from '../../shared/weight.js';
// Frete estimado por peso para o catálogo/SEO (Schema.org e feed).
// Usa o serviço mais barato disponível (e-Packet Light ou Air Parcel) pelo peso real.

import { getELightRate, getAirParcelRate, countryToZone, type JapanPostZone } from './japanPostRates';
import type { Product } from '@/types';

/** Peso usado para frete: weightGrams + embalagem real, ou 500g base. */
export function catalogWeightG(product: Product): number {
  if (product.weightGrams && product.weightGrams > 0) return packedWeightG(product.weightGrams);
  return packedWeightG(500);
}

/** Frete mais barato em ¥ para o peso e zona. Retorna 0 se fora de faixa. */
export function cheapestShippingYen(weightG: number, zone: JapanPostZone): number {
  const billable = Math.max(100, weightG);
  const opts: number[] = [];
  const eLight = getELightRate(billable, zone);
  if (eLight != null) opts.push(eLight);
  const air = getAirParcelRate(billable, zone);
  if (air != null) opts.push(air);
  return opts.length ? Math.min(...opts) : 0;
}

/** Frete estimado em ¥ para o país do cliente (Brasil zona 5, Europa zona 3). */
export function catalogShippingYen(product: Product, country: string): number {
  const zone = countryToZone(country);
  return cheapestShippingYen(catalogWeightG(product), zone);
}
