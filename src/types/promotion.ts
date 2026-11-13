export const PROMO_TYPES = [
  { value: 'abertura',   label: '🎉 Promoção de Abertura', labelKey: 'promo.type.abertura' },
  { value: 'mes',        label: '📅 Promoção do Mês', labelKey: 'promo.type.mes' },
  { value: 'lancamento', label: '🚀 Promoção de Lançamento', labelKey: 'promo.type.lancamento' },
  { value: 'temporada',  label: '🌸 Promoção de Temporada', labelKey: 'promo.type.temporada' },
  { value: 'relampago',  label: '⚡ Promoção Relâmpago', labelKey: 'promo.type.relampago' },
  { value: 'especial',   label: '⭐ Promoção Especial', labelKey: 'promo.type.especial' },
  { value: 'exclusiva',  label: '💎 Exclusiva Online', labelKey: 'promo.type.exclusiva' },
];

export interface ScheduledNextPromo {
  type: string;
  productId: string;
  productName: string;
  productImage: string;
  originalPriceYen: number;
  promoPriceYen: number;
  discountPct: number;
  limitPerPerson: number;
  maxProducts: number | null; // total de unidades disponíveis na promoção (null = ilimitado)
  durationDays: number | null;
}

export interface ActivePromo {
  type: string;
  productId: string;
  productName: string;
  productImage: string;
  originalPriceYen: number;
  promoPriceYen: number;
  discountPct: number;
  limitPerPerson: number;
  maxProducts: number | null;   // total de unidades disponíveis (null = ilimitado)
  soldCount: number;            // quantas já foram vendidas nesta promoção
  expiresAt: number | null;
  nextPromo: ScheduledNextPromo | null;
  limitResetAt?: number;
}
