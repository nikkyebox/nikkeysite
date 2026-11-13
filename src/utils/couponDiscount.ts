import type { Coupon } from '@/context/UserContext';

// Desconto a partir de um cupom do perfil (porcentagem ou valor fixo).
export const computeCouponDiscount = (coupon: Coupon, subtotal: number): number => {
  if (coupon.freeShipping) return 0;
  if (coupon.discountType === 'percentage') return subtotal * (coupon.discount / 100);
  return Math.min(coupon.discount, subtotal);
};
