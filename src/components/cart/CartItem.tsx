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

interface CartItemProps {
  item: CartItemType;
  couponDiscount?: number; // desconto proporcional do cupom neste item (na moeda exibida)
}

const CartItemComponent: React.FC<CartItemProps> = ({ item, couponDiscount = 0 }) => {
  const { updateQuantity, removeFromCart } = useCart();
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
  const promoMax = isPromo ? ((item.product as any).promoLimit ?? 1) : Infinity;
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
            <span className="text-[9px] font-black text-white bg-purple-600 px-1.5 rounded">GRÁTIS</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="inline-block text-[10px] font-bold text-purple-700 bg-purple-100 dark:bg-purple-900 px-2 py-0.5 rounded-full mb-1">🎁 Presente da promoção</span>
              <h3 className="font-display font-semibold text-foreground truncate">{productName}</h3>
              <p className="text-sm text-muted-foreground">{productFlavor}</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-purple-600 font-semibold">Qtd: {item.quantity}</span>
            <div className="text-right">
              <p className="text-sm line-through text-gray-400">{formatPrice(finalPrice, currency)}</p>
              <p className="font-sans text-lg font-extrabold text-green-600">GRÁTIS</p>
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
            <Link to={productUrl} className="hover:underline hover:text-pink-600 transition-colors">
              <h3 className="font-display font-semibold text-foreground truncate">
                {productName}
              </h3>
            </Link>
            <p className="text-sm text-muted-foreground">
              {productFlavor}
            </p>
            {isPromo ? (
              <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">
                ✨ Preço Promocional
              </span>
            ) : (
              <span className={`
                inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium
                ${item.product.category === 'premium'
                  ? 'bg-gold/20 text-caramel-dark'
                  : 'bg-primary/10 text-primary'
                }
              `}>
                {item.product.category === 'premium' ? 'Premium' :
                 item.product.category === 'artesanal' ? 'Artesanal' :
                 item.product.category.toUpperCase()}
              </span>
            )}
          </div>

          <button
            onClick={() => removeFromCart(item.product.id, item.size)}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between mt-3">
          {/* Quantity controls */}
          <div className="space-y-1">
            <div className="flex items-center border border-border rounded-lg">
              <button
                onClick={() => updateQuantity(item.product.id, item.size, item.quantity - 1)}
                className="p-1.5 hover:bg-secondary/50 transition-colors rounded-l-lg"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
              <button
                onClick={() => updateQuantity(item.product.id, item.size, item.quantity + 1)}
                disabled={atStockLimit}
                className={cn("p-1.5 hover:bg-secondary/50 transition-colors rounded-r-lg", atStockLimit && "opacity-30 cursor-not-allowed")}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {atPromoLimit && (
              <p className="text-[10px] text-pink-600 font-semibold leading-tight">
                Limite promocional atingido ({promoMax}x/pessoa)
              </p>
            )}
          </div>

          {/* Price */}
          <div className="text-right">
            {couponDiscount > 0 && (
              <p className="text-xs text-muted-foreground line-through">{formatPrice(finalPrice, currency)}</p>
            )}
            <p className={`font-sans text-lg font-extrabold ${isPromo ? 'text-green-600' : 'text-primary'}`}>
              {formatPrice(finalPrice - couponDiscount, currency)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartItemComponent;
