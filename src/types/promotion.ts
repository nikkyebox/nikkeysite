export const PROMO_TYPES = [
  { value: 'abertura',   label: '🎉 Promoção de Abertura' },
  { value: 'mes',        label: '📅 Promoção do Mês' },
  { value: 'lancamento', label: '🚀 Promoção de Lançamento' },
  { value: 'temporada',  label: '🌸 Promoção de Temporada' },
  { value: 'relampago',  label: '⚡ Promoção Relâmpago' },
  { value: 'especial',   label: '⭐ Promoção Especial' },
  { value: 'exclusiva',  label: '💎 Exclusiva Online' },
  { value: 'frete',      label: '🚚 Frete Grátis' },
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
