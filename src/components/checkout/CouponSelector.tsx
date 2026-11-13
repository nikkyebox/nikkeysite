import React, { useState } from 'react';
import { Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useUser, Coupon } from '@/context/UserContext';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/context/LanguageContext';
import { computeCouponDiscount } from '@/utils/couponDiscount';

interface CouponSelectorProps {
  totalPrice: number;
  onCouponApply: (coupon: Coupon, discount: number) => void;
  onCouponRemove: () => void;
  appliedCoupon: Coupon | null;
}

const CouponSelector: React.FC<CouponSelectorProps> = ({
  totalPrice,
  onCouponApply,
  onCouponRemove,
  appliedCoupon,
}) => {
  const { coupons, isAuthenticated } = useUser();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const dateLocale = language === 'ja' ? 'ja-JP' : language === 'en' ? 'en-US' : 'pt-BR';
  const [showCoupons, setShowCoupons] = useState(false);

  // Apenas os cupons do PERFIL que estão válidos (não usados, não expirados).
  // Cupom de "frete grátis" (freeShipping) não existe mais: não é oferecido.
  const now = new Date();
  const availableCoupons = coupons.filter(
    (c) => !c.isUsed && new Date(c.expiresAt) > now && !c.freeShipping
  );

  const handleSelectCoupon = (coupon: Coupon) => {
    const discount = computeCouponDiscount(coupon, totalPrice);
    onCouponApply(coupon, discount);
    setShowCoupons(false);
    toast({
      title: t('coupon.appliedTitle'),
      description: t('coupon.discountApplied').replace('{amount}', `¥${Math.round(discount).toLocaleString()}`),
    });
  };

  const handleRemoveCoupon = () => {
    onCouponRemove();
    toast({ title: t('coupon.removedTitle'), description: t('coupon.removedDesc') });
  };

  return (
    <div className="pt-4 mt-4 border-t border-border">
      {!appliedCoupon ? (
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Tag className="w-4 h-4" />
            {t('coupon.myCoupons')}
          </Label>

          {!isAuthenticated ? (
            <p className="text-sm text-muted-foreground">
              {t('coupon.loginPrompt')}
            </p>
          ) : availableCoupons.length > 0 ? (
            <>
              <Button
                type="button"
                onClick={() => setShowCoupons(!showCoupons)}
                variant="outline"
                className="w-full"
              >
                {showCoupons ? t('coupon.hide') : t('coupon.showCount').replace('{count}', String(availableCoupons.length))}
              </Button>

              {showCoupons && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableCoupons.map((coupon) => {
                    const discount = computeCouponDiscount(coupon, totalPrice);
                    const discountText = coupon.discountType === 'fixed'
                      ? `¥${coupon.discount.toLocaleString()}`
                      : `${coupon.discount}%`;

                    return (
                      <button
                        key={coupon.id}
                        type="button"
                        onClick={() => handleSelectCoupon(coupon)}
                        className="w-full p-3 rounded-lg border-2 border-border hover:border-primary transition-all text-left"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-bold text-primary">{coupon.code}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex items-center gap-1">
                                {`-${discountText}`}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-1">{coupon.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('coupon.validUntil').replace('{date}', new Date(coupon.expiresAt).toLocaleDateString(dateLocale))}
                            </p>
                          </div>
                          <div className="text-right ml-2">
                            <p className="text-sm font-bold text-green-600 dark:text-green-400">
                              -¥{Math.round(discount).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('coupon.none')}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  {appliedCoupon.code}
                </p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  {appliedCoupon.description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRemoveCoupon}
              className="p-1 rounded-full hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
            >
              <X className="w-4 h-4 text-green-700 dark:text-green-300" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CouponSelector;
