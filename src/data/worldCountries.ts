// Fonte única de verdade dos países atendidos pela loja.
// Cada país define: código ISO (bandeira + zippopotam CEP), idioma, moeda de
// exibição, zona Japan Post (frete) e taxa de imposto de importação (IVA/VAT/GST).
//
// Moedas: países com moeda própria suportada (BRL/EUR/JPY) usam a sua; o resto
// usa USD. Idioma: pt (Brasil/PT), ja (Japão), en (demais).
// Zonas Japan Post: 1 China/Coreia/Taiwan · 2 Ásia · 3 Europa/Oceania/Canadá/
// Oriente Médio · 4 EUA/Guam · 5 América Central/Sul/África.

import { Language } from '@/data/translations';

export type Currency = 'BRL' | 'EUR' | 'USD' | 'JPY';

export interface CountryConfig {
  name: string;        // nome exibido (= valor de CountryType)
  iso: string;         // ISO alpha-2 (bandeira + zippopotam)
  language: Language;
  currency: Currency;
  zone: 1 | 2 | 3 | 4 | 5;
  vat: number;         // imposto de importação (0–1); 0 = sem imposto declarado
  zipLookup: boolean;  // zippopotam.us cobre este país?
}

// Ordenado por relevância para a loja. Os 4 "nativos" (moeda própria) primeiro.
export const WORLD_COUNTRIES: CountryConfig[] = [
  // ── Nativos (moeda própria) ──
  { name: 'Brasil',          iso: 'br', language: 'pt', currency: 'BRL', zone: 5, vat: 0.17, zipLookup: true },
  { name: 'Japão',           iso: 'jp', language: 'ja', currency: 'JPY', zone: 1, vat: 0,    zipLookup: true },
  { name: 'Portugal',        iso: 'pt', language: 'pt', currency: 'EUR', zone: 3, vat: 0.23, zipLookup: true },
  { name: 'França',          iso: 'fr', language: 'en', currency: 'EUR', zone: 3, vat: 0.20, zipLookup: true },
  { name: 'Itália',          iso: 'it', language: 'en', currency: 'EUR', zone: 3, vat: 0.22, zipLookup: true },
  { name: 'Espanha',         iso: 'es', language: 'en', currency: 'EUR', zone: 3, vat: 0.21, zipLookup: true },
  { name: 'Estados Unidos',  iso: 'us', language: 'en', currency: 'USD', zone: 4, vat: 0,    zipLookup: true }, // sales tax por estado (tratado à parte)

  // ── América (USD) ──
  { name: 'Canadá',          iso: 'ca', language: 'en', currency: 'USD', zone: 3, vat: 0.13, zipLookup: true },
  { name: 'México',          iso: 'mx', language: 'en', currency: 'USD', zone: 3, vat: 0.16, zipLookup: true },
  { name: 'Argentina',       iso: 'ar', language: 'en', currency: 'USD', zone: 5, vat: 0.21, zipLookup: true },
  { name: 'Chile',           iso: 'cl', language: 'en', currency: 'USD', zone: 5, vat: 0.19, zipLookup: true },
  { name: 'Colômbia',        iso: 'co', language: 'en', currency: 'USD', zone: 5, vat: 0.19, zipLookup: false },
  { name: 'Peru',            iso: 'pe', language: 'en', currency: 'USD', zone: 5, vat: 0.18, zipLookup: false },
  { name: 'Uruguai',         iso: 'uy', language: 'en', currency: 'USD', zone: 5, vat: 0.22, zipLookup: false },

  // ── Europa não-euro (USD) ──
  { name: 'Reino Unido',     iso: 'gb', language: 'en', currency: 'USD', zone: 3, vat: 0.20, zipLookup: true },
  { name: 'Alemanha',        iso: 'de', language: 'en', currency: 'EUR', zone: 3, vat: 0.19, zipLookup: true },
  { name: 'Países Baixos',   iso: 'nl', language: 'en', currency: 'EUR', zone: 3, vat: 0.21, zipLookup: true },
  { name: 'Bélgica',         iso: 'be', language: 'en', currency: 'EUR', zone: 3, vat: 0.21, zipLookup: true },
  { name: 'Suíça',           iso: 'ch', language: 'en', currency: 'USD', zone: 3, vat: 0.077, zipLookup: true },
  { name: 'Suécia',          iso: 'se', language: 'en', currency: 'USD', zone: 3, vat: 0.25, zipLookup: true },
  { name: 'Noruega',         iso: 'no', language: 'en', currency: 'USD', zone: 3, vat: 0.25, zipLookup: false },
  { name: 'Irlanda',         iso: 'ie', language: 'en', currency: 'EUR', zone: 3, vat: 0.23, zipLookup: false },
  { name: 'Áustria',         iso: 'at', language: 'en', currency: 'EUR', zone: 3, vat: 0.20, zipLookup: true },
  { name: 'Polônia',         iso: 'pl', language: 'en', currency: 'USD', zone: 3, vat: 0.23, zipLookup: true },

  // ── Ásia (USD) ──
  { name: 'China',           iso: 'cn', language: 'en', currency: 'USD', zone: 1, vat: 0.13, zipLookup: false },
  { name: 'Coreia do Sul',   iso: 'kr', language: 'en', currency: 'USD', zone: 1, vat: 0.10, zipLookup: false },
  { name: 'Taiwan',          iso: 'tw', language: 'en', currency: 'USD', zone: 1, vat: 0.05, zipLookup: true },
  { name: 'Cingapura',       iso: 'sg', language: 'en', currency: 'USD', zone: 2, vat: 0.09, zipLookup: true },
  { name: 'Tailândia',       iso: 'th', language: 'en', currency: 'USD', zone: 2, vat: 0.07, zipLookup: false },
  { name: 'Malásia',         iso: 'my', language: 'en', currency: 'USD', zone: 2, vat: 0.10, zipLookup: false },
  { name: 'Filipinas',       iso: 'ph', language: 'en', currency: 'USD', zone: 2, vat: 0.12, zipLookup: true },
  { name: 'Indonésia',       iso: 'id', language: 'en', currency: 'USD', zone: 2, vat: 0.11, zipLookup: false },
  { name: 'Vietnã',          iso: 'vn', language: 'en', currency: 'USD', zone: 2, vat: 0.10, zipLookup: false },
  { name: 'Índia',           iso: 'in', language: 'en', currency: 'USD', zone: 2, vat: 0.18, zipLookup: true },
  { name: 'Hong Kong',       iso: 'hk', language: 'en', currency: 'USD', zone: 2, vat: 0,    zipLookup: false },

  // ── Oceania (USD) ──
  { name: 'Austrália',       iso: 'au', language: 'en', currency: 'USD', zone: 3, vat: 0.10, zipLookup: true },
  { name: 'Nova Zelândia',   iso: 'nz', language: 'en', currency: 'USD', zone: 3, vat: 0.15, zipLookup: true },

  // ── Oriente Médio (USD) ──
  { name: 'Emirados Árabes', iso: 'ae', language: 'en', currency: 'USD', zone: 3, vat: 0.05, zipLookup: false },
  { name: 'Israel',          iso: 'il', language: 'en', currency: 'USD', zone: 3, vat: 0.17, zipLookup: false },
  { name: 'Arábia Saudita',  iso: 'sa', language: 'en', currency: 'USD', zone: 3, vat: 0.15, zipLookup: false },
  { name: 'Turquia',         iso: 'tr', language: 'en', currency: 'USD', zone: 3, vat: 0.20, zipLookup: false },

  // ── África (USD) ──
  { name: 'África do Sul',   iso: 'za', language: 'en', currency: 'USD', zone: 5, vat: 0.15, zipLookup: true },
  { name: 'Angola',          iso: 'ao', language: 'pt', currency: 'USD', zone: 5, vat: 0.14, zipLookup: false },
  { name: 'Moçambique',      iso: 'mz', language: 'pt', currency: 'USD', zone: 5, vat: 0.16, zipLookup: false },
];

// Acesso rápido por nome
const BY_NAME = new Map(WORLD_COUNTRIES.map(c => [c.name, c]));

export function getCountryConfig(name: string): CountryConfig | undefined {
  return BY_NAME.get(name);
}

// Fallback universal — usado se um país não estiver na lista
export const FALLBACK_CONFIG: CountryConfig = {
  name: 'Outros', iso: 'un', language: 'en', currency: 'USD', zone: 3, vat: 0.10, zipLookup: false,
};
