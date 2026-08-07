import { Prefecture } from '@/types';

export const europePrefectures: Record<string, Prefecture[]> = {
  Portugal: [
    { name: 'Lisboa', nameJa: 'Lisboa', zone: 1 },
    { name: 'Porto', nameJa: 'Porto', zone: 1 },
    { name: 'Braga', nameJa: 'Braga', zone: 1 },
    { name: 'Coimbra', nameJa: 'Coimbra', zone: 1 },
    { name: 'Setúbal', nameJa: 'Setúbal', zone: 1 },
    { name: 'Aveiro', nameJa: 'Aveiro', zone: 2 },
    { name: 'Faro (Algarve)', nameJa: 'Faro (Algarve)', zone: 2 },
    { name: 'Leiria', nameJa: 'Leiria', zone: 2 },
    { name: 'Funchal (Madeira)', nameJa: 'Funchal (Madeira)', zone: 3 },
    { name: 'Ponta Delgada (Açores)', nameJa: 'Ponta Delgada (Açores)', zone: 3 }
  ],
  França: [
    { name: 'Île-de-France (Paris)', nameJa: 'Île-de-France (Paris)', zone: 1 },
    { name: 'Auvergne-Rhône-Alpes (Lyon)', nameJa: 'Auvergne-Rhône-Alpes (Lyon)', zone: 2 },
    { name: 'Provence-Alpes-Côte d\'Azur (Marseille)', nameJa: 'Provence-Alpes-Côte d\'Azur (Marseille)', zone: 2 },
    { name: 'Nouvelle-Aquitaine (Bordeaux)', nameJa: 'Nouvelle-Aquitaine (Bordeaux)', zone: 2 },
    { name: 'Occitanie (Toulouse)', nameJa: 'Occitanie (Toulouse)', zone: 3 },
    { name: 'Hauts-de-France (Lille)', nameJa: 'Hauts-de-France (Lille)', zone: 3 },
    { name: 'Corse (Córsega)', nameJa: 'Corse (Córsega)', zone: 4 }
  ],
  Itália: [
    { name: 'Lazio (Roma)', nameJa: 'Lazio (Roma)', zone: 1 },
    { name: 'Lombardia (Milão)', nameJa: 'Lombardia (Milão)', zone: 1 },
    { name: 'Toscana (Florença)', nameJa: 'Toscana (Florença)', zone: 2 },
    { name: 'Veneto (Veneza)', nameJa: 'Veneto (Veneza)', zone: 2 },
    { name: 'Piemonte (Turim)', nameJa: 'Piemonte (Turim)', zone: 2 },
    { name: 'Campania (Nápoles)', nameJa: 'Campania (Nápoles)', zone: 3 },
    { name: 'Sicilia (Sicília)', nameJa: 'Sicilia (Sicília)', zone: 4 }
  ],
  Espanha: [
    { name: 'Madrid', nameJa: 'Madrid', zone: 1 },
    { name: 'Cataluña (Barcelona)', nameJa: 'Cataluña (Barcelona)', zone: 1 },
    { name: 'Andalucía (Sevilla)', nameJa: 'Andalucía (Sevilla)', zone: 2 },
    { name: 'Valencia', nameJa: 'Valencia', zone: 2 },
    { name: 'Galicia', nameJa: 'Galicia', zone: 3 },
    { name: 'Islas Baleares (Maiorca)', nameJa: 'Islas Baleares (Maiorca)', zone: 3 },
    { name: 'Islas Canarias', nameJa: 'Islas Canarias', zone: 4 }
  ]
};

// Shipping rates by carrier, box size, and zone for Europe (in R$ / BRL equivalent)
// Mapped to carriers: yuubin -> Postal Local, yamato -> EMS Aéreo, sagawa -> Priority Courier
export const europeShippingRates = {
  yuubin: {
    '60': { 1: 159.90, 2: 169.90, 3: 179.90, 4: 199.90 },
    '80': { 1: 349.90, 2: 369.90, 3: 389.90, 4: 419.90 }
  },
  yamato: {
    '60': { 1: 299.90, 2: 319.90, 3: 339.90, 4: 369.90 },
    '80': { 1: 599.90, 2: 619.90, 3: 649.90, 4: 699.90 }
  },
  sagawa: {
    '60': { 1: 449.90, 2: 469.90, 3: 499.90, 4: 529.90 },
    '80': { 1: 799.90, 2: 839.90, 3: 879.90, 4: 929.90 }
  }
};
