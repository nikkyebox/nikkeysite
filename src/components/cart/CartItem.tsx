import React from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CartItem as CartItemType } from '@/types';
import { useCart } from '@/context/CartContext';
import { useLanguage } from '@/context/LanguageContext';
import { getTranslatedProductFlavor } from '@/data/translations';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { effectiveYen } from '@/utils/pricing';
import { convertYen as fxConvert } from '@/services/fxService';
import { productEnglishName } from '@/utils/productName';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import PriceText from '@/components/PriceText';

interface CartItemProps {
  item: CartItemType;
  couponDiscount?: number; // desconto proporcional do cupom neste item (na moeda exibida)
}

const CartItemComponent: React.FC<CartItemProps> = ({ item, couponDiscount = 0 }) => {
  const { updateQuantity, removeFromCart, addToCart } = useCart();
  const { toast } = useToast();
  const { t, selectedCountry } = useLanguage();
  const isPromo = item.product.id.endsWith('_promo');
  const basePrice = effectiveYen(item.product, item.size);

  // Compute translated values
  const productName = productEnglishName(item.product);
  const productFlavor = getTranslatedProductFlavor(item.product.id, t) || item.product.flavor;

  // Determine display price and currency
  const isEuro = ['Portugal', 'França', 'Itália', 'Espanha'].includes(selectedCountry);
  const currency = getCurrencyByCountry(selectedCountry);
  const unitPrice = fxConvert(basePrice, currency);

  const finalPrice = unitPrice * item.quantity;
  const stockMax = item.product.stock && !item.product.stock.unlimited ? item.product.stock.quantity : Infinity;
  const promoMax = isPromo ? (item.product.promoLimit ?? 1) : Infinity;
  const maxQty = Math.min(stockMax, promoMax);
  const atStockLimit = item.quantity >= maxQty;
  const atPromoLimit = isPromo && item.quantity >= promoMax;

  if (item.freeGift) {
    return (
      <div className="flex gap-4 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-xl border border-purple-200 dark:border-purple-800">
        <div className="w-24 h-24 rounded-lg overflow-hidden bg-secondary/50 flex-shrink-0 relative">
          {item.product.image ? (
            <img src={item.product.image} alt={productName} loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl">🎁</span>
          )}
          <div className="absolute inset-0 bg-purple-600/20 flex items-end justify-center pb-1">
            <span className="text-xs font-black text-white bg-purple-600 px-1.5 rounded">{t('cartItem.free')}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="inline-block text-xs font-bold text-purple-700 bg-purple-100 dark:bg-purple-900 px-2 py-0.5 rounded-full mb-1">🎁 {t('cartItem.promoGift')}</span>
              <h3 className="font-display font-semibold text-foreground truncate">{productName}</h3>
              <p className="text-sm text-muted-foreground">{productFlavor}</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-purple-600 font-semibold">{t('cartItem.qty')} {item.quantity}</span>
            <div className="text-right">
              <p className="text-sm line-through text-gray-400">{formatPrice(finalPrice, currency)}</p>
              <p className="font-sans text-lg font-extrabold text-green-600">{t('cartItem.free')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const productUrl = `/produto/${item.product.id}`;

  return (
    <div className="flex gap-4 p-4 bg-card rounded-xl border border-border">
      {/* Image — clicável para ir à página do produto */}
      <Link to={productUrl} className="w-24 h-24 rounded-lg overflow-hidden bg-secondary/50 flex-shrink-0 hover:opacity-90 transition-opacity">
        {item.product.image ? (
          <img src={item.product.image} alt={productName} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">🌸</span>
        )}
      </Link>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link to={productUrl} className="hover:underline hover:text-purple-600 transition-colors">
              <h3 className="font-display font-semibold text-foreground truncate">
                {productName}
              </h3>
            </Link>
            <p className="text-sm text-muted-foreground">
              {productFlavor}
            </p>
            {isPromo && (
              <span className="mt-1 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                {t('cartItem.promoPrice')}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              removeFromCart(item.product.id, item.size);
              // Remoção de 1 item é reversível: desfazer no toast em vez de diálogo.
              toast({
                title: t('cartItem.removed').replace('{name}', productName),
                action: (
                  <ToastAction
                    altText={t('cartItem.undo')}
                    onClick={() => addToCart(item.product, item.size, item.quantity, item.variantLabel)}
                  >
                    {t('cartItem.undo')}
                  </ToastAction>
                ),
              });
            }}
            aria-label={t('cartItem.remove').replace('{name}', productName)}
            title={t('cartItem.remove').replace('{name}', productName)}
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center justify-between mt-3">
          {/* Quantity controls */}
          <div className="space-y-1">
            <div className="flex items-center rounded-lg border border-border" role="group" aria-label={`${t('productDetail.quantity')}: ${productName}`}>
              <button
                type="button"
                onClick={() => updateQuantity(item.product.id, item.size, item.quantity - 1)}
                aria-label={t('productDetail.decrease')}
                className="flex h-11 w-10 items-center justify-center rounded-l-lg transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <output className="w-7 text-center text-sm font-medium tabular-nums" aria-live="polite">{item.quantity}</output>
              <button
                type="button"
                onClick={() => updateQuantity(item.product.id, item.size, item.quantity + 1)}
                disabled={atStockLimit}
                aria-label={t('productDetail.increase')}
                className={cn('flex h-11 w-10 items-center justify-center rounded-r-lg transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', atStockLimit && 'cursor-not-allowed opacity-30')}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {atPromoLimit && (
              <p className="text-xs text-purple-600 font-semibold leading-tight">
                {t('cartItem.promoLimit').replace('{max}', String(promoMax))}
              </p>
            )}
          </div>

          {/* Price */}
          <div className="text-right">
            {couponDiscount > 0 && (
              <p className="whitespace-nowrap text-xs text-muted-foreground line-through">{formatPrice(finalPrice, currency).split(' (')[0]}</p>
            )}
            <PriceText
              value={formatPrice(finalPrice - couponDiscount, currency)}
              align="right"
              className={cn('font-sans text-lg font-semibold', isPromo ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground')}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartItemComponent;
