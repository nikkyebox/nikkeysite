// Campanha promocional enviada por notificação (e-mail/push) e resgatável por
// código no carrinho. Uma campanha = um doc em promo_campaigns (id = code lower).
export type PromoMechanic = 'discount' | 'coupon' | 'bogo' | 'bogo_other' | 'points' | 'none';

export interface PromoCampaign {
  code: string;            // código de resgate (maiúsculo no corpo, lower no id)
  mechanic: PromoMechanic;
  productId?: string;      // produto em destaque / qualificante (BOGO)
  giftProductId?: string;  // bogo_other: produto de presente (bogo usa productId)
  couponCode?: string;     // coupon: código a conceder ao perfil (próxima compra)
  discountPct?: number;    // discount / coupon: % de desconto
  points?: number;         // points: pontos a creditar pós-compra
  headline?: string;
  tagline?: string;
  description?: string;
  badge?: string;
  couponLabel?: string;    // nome do cupom que o link aplica ("AGORA15"), mostrado
                           // no carrinho e no e-mail no lugar do código interno
  productName?: string;    // só p/ exibição
  productImage?: string;   // só p/ exibição (feed de notificações do perfil)
  keepProductDiscount?: boolean; // true = mantém o discountPercent do produto junto com a promo; false/ausente = produto volta ao preço original
  createdAt: number;       // ms
  expiresAt?: number;      // ms (opcional)
  active: boolean;
  perCpfLimit?: number;    // padrão 1
}
