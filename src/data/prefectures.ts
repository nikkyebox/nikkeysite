import { Prefecture } from '@/types';

// Zones for Brazil based on shipping ports/airports (e.g. GRU/VCP airports in Sao Paulo)
// Zone 1: Sudeste (SP, RJ, MG, ES) - Fast and economical
// Zone 2: Sul & Centro-Oeste (PR, SC, RS, DF, GO, MS, MT)
// Zone 3: Nordeste (BA, CE, PE, AL, PB, RN, SE, PI, MA)
// Zone 4: Norte (AM, PA, AC, AP, RO, RR, TO) - Remote region, takes longer

export const prefectures: Prefecture[] = [
  // Zone 1 - Sudeste
  { name: 'SP', nameJa: 'São Paulo', zone: 1 },
  { name: 'RJ', nameJa: 'Rio de Janeiro', zone: 1 },
  { name: 'MG', nameJa: 'Minas Gerais', zone: 1 },
  { name: 'ES', nameJa: 'Espírito Santo', zone: 1 },
  
  // Zone 2 - Sul & Centro-Oeste
  { name: 'PR', nameJa: 'Paraná', zone: 2 },
  { name: 'SC', nameJa: 'Santa Catarina', zone: 2 },
  { name: 'RS', nameJa: 'Rio Grande do Sul', zone: 2 },
  { name: 'DF', nameJa: 'Distrito Federal', zone: 2 },
  { name: 'GO', nameJa: 'Goiás', zone: 2 },
  { name: 'MS', nameJa: 'Mato Grosso do Sul', zone: 2 },
  { name: 'MT', nameJa: 'Mato Grosso', zone: 2 },
  
  // Zone 3 - Nordeste
  { name: 'BA', nameJa: 'Bahia', zone: 3 },
  { name: 'CE', nameJa: 'Ceará', zone: 3 },
  { name: 'PE', nameJa: 'Pernambuco', zone: 3 },
  { name: 'MA', nameJa: 'Maranhão', zone: 3 },
  { name: 'PB', nameJa: 'Paraíba', zone: 3 },
  { name: 'PE-2', nameJa: 'Piauí', zone: 3 }, // Map PI to PE-2 or keep it simple
  { name: 'PI', nameJa: 'Piauí', zone: 3 },
  { name: 'RN', nameJa: 'Rio Grande do Norte', zone: 3 },
  { name: 'AL', nameJa: 'Alagoas', zone: 3 },
  { name: 'SE', nameJa: 'Sergipe', zone: 3 },

  // Zone 4 - Norte
  { name: 'AM', nameJa: 'Amazonas', zone: 4 },
  { name: 'PA', nameJa: 'Pará', zone: 4 },
  { name: 'AC', nameJa: 'Acre', zone: 4 },
  { name: 'AP', nameJa: 'Amapá', zone: 4 },
  { name: 'RO', nameJa: 'Rondônia', zone: 4 },
  { name: 'RR', nameJa: 'Roraima', zone: 4 },
  { name: 'TO', nameJa: 'Tocantins', zone: 4 }
];

// Shipping rates by carrier, box size, and zone (in R$)
// Mapped to carriers: yuubin -> Correios Padrão, yamato -> EMS Aéreo, sagawa -> Priority Courier
export const shippingRates = {
  yuubin: {
    '60': { 1: 139.90, 2: 149.90, 3: 159.90, 4: 169.90 },
    '80': { 1: 329.90, 2: 339.90, 3: 349.90, 4: 369.90 }
  },
  yamato: {
    '60': { 1: 279.90, 2: 289.90, 3: 299.90, 4: 319.90 },
    '80': { 1: 559.90, 2: 579.90, 3: 599.90, 4: 629.90 }
  },
  sagawa: {
    '60': { 1: 419.90, 2: 439.90, 3: 459.90, 4: 479.90 },
    '80': { 1: 769.90, 2: 789.90, 3: 819.90, 4: 859.90 }
  }
};

export type CarrierName = keyof typeof shippingRates;
export type BoxSize = '60' | '80';
