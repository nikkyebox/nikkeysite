import { getCountryConfig } from '@/data/worldCountries';

// Brazilian import tax rules
// Source: Receita Federal / Portaria MF nº 612/2023
export const BRAZIL_TAX = {
  thresholdBRL: 250,   // ~USD 50 — below this, flat 20% II applies
  belowRate: 0.20,
  aboveRate: 0.60,
  aboveOffset: 62.50,  // simplified formula: (price × 0.60) − 62.50
  icmsRate: 0.17,      // average ICMS (varies by state, 17% is a safe estimate)
} as const;

export const EU_VAT_RATES: Record<string, number> = {
  Portugal: 0.23,
  França:   0.20,
  Itália:   0.22,
  Espanha:  0.21,
};

export function calcBrazilTax(price: number, icmsRate: number = BRAZIL_TAX.icmsRate): { federal: number; icms: number; total: number } {
  // Brazil import taxes depend on customs authority rules and cannot be reliably estimated without verified regime.
  // Return zeros to suppress numeric display while preserving function signature for admin tools and API contracts.
  return { federal: 0, icms: 0, total: 0 };
}

// ── ICMS por estado (alíquota interna aproximada, 2024/2025) ────────────────
// Usada na importação: incide a alíquota interna do estado de DESTINO.
// Valores aproximados (variam com FECP/legislação) — bom para orçamento.
export const ICMS_BY_UF: Record<string, number> = {
  AC: 0.19, AL: 0.20, AP: 0.18, AM: 0.20, BA: 0.205, CE: 0.20,
  DF: 0.20, ES: 0.17, GO: 0.19, MA: 0.23, MG: 0.18, MS: 0.17,
  MT: 0.17, PA: 0.19, PB: 0.20, PR: 0.195, PE: 0.205, PI: 0.225,
  RJ: 0.22, RN: 0.20, RS: 0.17, RO: 0.195, RR: 0.20, SC: 0.17,
  SP: 0.18, SE: 0.20, TO: 0.20,
};

// Faixas de CEP → UF (prefixo de 5 dígitos). Fonte: Correios.
const CEP_RANGES: { min: number; max: number; uf: string }[] = [
  { min: 1000,  max: 19999, uf: 'SP' },
  { min: 20000, max: 28999, uf: 'RJ' },
  { min: 29000, max: 29999, uf: 'ES' },
  { min: 30000, max: 39999, uf: 'MG' },
  { min: 40000, max: 48999, uf: 'BA' },
  { min: 49000, max: 49999, uf: 'SE' },
  { min: 50000, max: 56999, uf: 'PE' },
  { min: 57000, max: 57999, uf: 'AL' },
  { min: 58000, max: 58999, uf: 'PB' },
  { min: 59000, max: 59999, uf: 'RN' },
  { min: 60000, max: 63999, uf: 'CE' },
  { min: 64000, max: 64999, uf: 'PI' },
  { min: 65000, max: 65999, uf: 'MA' },
  { min: 66000, max: 68899, uf: 'PA' },
  { min: 68900, max: 68999, uf: 'AP' },
  { min: 69000, max: 69299, uf: 'AM' },
  { min: 69300, max: 69399, uf: 'RR' },
  { min: 69400, max: 69899, uf: 'AM' },
  { min: 69900, max: 69999, uf: 'AC' },
  { min: 70000, max: 72799, uf: 'DF' },
  { min: 72800, max: 72999, uf: 'GO' },
  { min: 73000, max: 73699, uf: 'DF' },
  { min: 73700, max: 76799, uf: 'GO' },
  { min: 76800, max: 76999, uf: 'RO' },
  { min: 77000, max: 77999, uf: 'TO' },
  { min: 78000, max: 78899, uf: 'MT' },
  { min: 78900, max: 78999, uf: 'RO' },
  { min: 79000, max: 79999, uf: 'MS' },
  { min: 80000, max: 87999, uf: 'PR' },
  { min: 88000, max: 89999, uf: 'SC' },
  { min: 90000, max: 99999, uf: 'RS' },
];

/** Extrai a UF a partir do CEP (aceita "01000-000", "01000000", etc.). */
export function ufFromCep(cep: string): string | null {
  const digits = (cep || '').replace(/\D/g, '');
  if (digits.length < 5) return null;
  const prefix = parseInt(digits.slice(0, 5), 10);
  const hit = CEP_RANGES.find(r => prefix >= r.min && prefix <= r.max);
  return hit ? hit.uf : null;
}

/** Alíquota de ICMS a partir do CEP; fallback = média (BRAZIL_TAX.icmsRate). */
export function icmsRateFromCep(cep: string): { uf: string | null; rate: number } {
  const uf = ufFromCep(cep);
  return { uf, rate: uf ? (ICMS_BY_UF[uf] ?? BRAZIL_TAX.icmsRate) : BRAZIL_TAX.icmsRate };
}

export function calcEuVat(price: number, country: string): number {
  return price * (EU_VAT_RATES[country] ?? 0.20);
}

// IVA/VAT/GST universal — consulta a taxa do país na tabela central.
// Para EUA usa sales tax por estado (calcUsSalesTax); demais usam a taxa do país.
export function calcImportTax(price: number, country: string, stateCode?: string): { tax: number; label: string } {
  if (country === 'Brasil') {
    // Brazil import taxes are subject to customs authority rules and cannot be reliably estimated.
    // Returning tax: 0 suppresses the estimate display while keeping factual customs warning in UI.
    return { tax: 0, label: '' };
  }
  if (country === 'Estados Unidos') {
    const tax = calcUsSalesTax(price, stateCode);
    const stRate = US_SALES_TAX[(stateCode || '').toUpperCase()];
    return { tax, label: stRate != null ? `Sales Tax Est. (${stateCode} ${(stRate * 100).toFixed(1)}%)` : 'Sales Tax Estimado (US)' };
  }
  const cfg = getCountryConfig(country);
  const rate = cfg ? cfg.vat : 0.10;
  if (rate <= 0) return { tax: 0, label: '' };
  return { tax: price * rate, label: `IVA / VAT Estimado (${Math.round(rate * 100)}%)` };
}

// ── USA Sales Tax por estado ─────────────────────────────────────────────────
// Taxa combinada média (estadual + média local), arredondada. Fonte: Tax Foundation.
// 5 estados sem sales tax: AK, DE, MT, NH, OR.
export const US_SALES_TAX: Record<string, number> = {
  AL: 0.0924, AK: 0.0176, AZ: 0.0838, AR: 0.0947, CA: 0.0882,
  CO: 0.0777, CT: 0.0635, DE: 0.0,    FL: 0.0702, GA: 0.0735,
  HI: 0.0444, ID: 0.0603, IL: 0.0888, IN: 0.0700, IA: 0.0694,
  KS: 0.0869, KY: 0.0600, LA: 0.0955, ME: 0.0550, MD: 0.0600,
  MA: 0.0625, MI: 0.0600, MN: 0.0749, MS: 0.0707, MO: 0.0825,
  MT: 0.0,    NE: 0.0694, NV: 0.0823, NH: 0.0,    NJ: 0.0660,
  NM: 0.0762, NY: 0.0852, NC: 0.0698, ND: 0.0697, OH: 0.0723,
  OK: 0.0899, OR: 0.0,    PA: 0.0634, RI: 0.0700, SC: 0.0744,
  SD: 0.0640, TN: 0.0955, TX: 0.0820, UT: 0.0719, VT: 0.0624,
  VA: 0.0573, WA: 0.0938, WV: 0.0656, WI: 0.0543, WY: 0.0536,
  DC: 0.0600,
};

const US_AVG_SALES_TAX = 0.0699; // média nacional quando o estado é desconhecido

/** Sales tax dos EUA: usa a sigla do estado (ex: 'CA', 'NY'); fallback = média nacional. */
export function calcUsSalesTax(price: number, stateCode?: string): number {
  const code = (stateCode || '').trim().toUpperCase();
  const rate = code in US_SALES_TAX ? US_SALES_TAX[code] : US_AVG_SALES_TAX;
  return price * rate;
}
