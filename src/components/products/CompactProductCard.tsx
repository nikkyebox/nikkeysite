import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Plus, Star } from 'lucide-react';
import { Product } from '@/types';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { wishlistService } from '@/services/wishlistService';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { effectiveYen, baseYen, hasDiscount, getVariants } from '@/utils/pricing';
import { convertYen as fxConvert } from '@/services/fxService';
import { productEnglishName } from '@/utils/productName';

interface CompactProductCardProps {
  product: Product;
}

/** Formata contagem grande de forma compacta (ex: 1234 -> "1.2K"). */
const formatCount = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

/** `formatPrice` devolve "R$ 154 (¥ 4,250)". Só separa para exibir em duas
 *  linhas — nenhum cálculo muda aqui. */
const splitPrice = (s: string): [string, string | null] => {
  const at = s.indexOf(' (');
  return at < 0 ? [s, null] : [s.slice(0, at), s.slice(at + 2, -1)];
};

const iconBtn =
  'flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Card de produto da grade. A área de imagem + nome é um <Link> de verdade
 * (abre em nova aba, leitor de tela anuncia link); favoritar e adicionar ao
 * carrinho são botões irmãos — nada interativo aninhado em outro interativo.
 */
const CompactProductCard: React.FC<CompactProductCardProps> = ({ product }) => {
  const { addToCart } = useCart();
  const { user } = useUser();
  const { toast } = useToast();
  const { t, selectedCountry } = useLanguage();
  const [isFavorite, setIsFavorite] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(false);

  useEffect(() => {
    if (user?.email) setIsFavorite(wishlistService.isInWishlist(user.email, product.id));
  }, [user, product.id]);

  const variants = getVariants(product);
  const firstVariant = [...variants].sort((a, b) => a.price - b.price)[0];
  const currency = getCurrencyByCountry(selectedCountry);
  const convertYen = (yen: number) => fxConvert(yen, currency);

  const promoActive = hasDiscount(product);
  const price = convertYen(effectiveYen(product, firstVariant?.id || 'small'));
  const originalPrice = convertYen(baseYen(product, firstVariant?.id || 'small'));
  const isSoldOut = Boolean(product.stock && !product.stock.unlimited && product.stock.quantity === 0);
  const name = productEnglishName(product);
  const [priceMain, priceRef] = splitPrice(formatPrice(price, currency));
  const href = `/produto/${product.id}`;
  const poster = product.thumbnail || product.image;
  const showVideo = Boolean(product.video && (product.videoCover || previewVideo));

  const handleToggleFavorite = () => {
    if (!user?.email) {
      toast({ title: t('card.loginFav') });
      return;
    }
    if (isFavorite) {
      wishlistService.removeFromWishlist(user.email, product.id);
      setIsFavorite(false);
    } else {
      wishlistService.addToWishlist(user.email, {
        productId: product.id,
        productName: name,
        productImage: product.image,
        productPrice: product.prices.small,
      });
      setIsFavorite(true);
    }
  };

  const handleAddToCart = () => {
    if (isSoldOut) return;
    addToCart(product, firstVariant?.id || 'small', 1, firstVariant?.label);
    toast({ title: t('promo.addedTitle'), description: name });
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors duration-150 focus-within:border-primary/40 hover:border-primary/40">
      <Link
        to={href}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onMouseEnter={() => product.video && setPreviewVideo(true)}
        onMouseLeave={() => setPreviewVideo(false)}
      >
        <div className="relative aspect-square overflow-hidden bg-muted/40">
          {poster && (
            <img
              src={poster}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-200 ease-out motion-safe:group-hover:scale-[1.03]"
            />
          )}
          {showVideo && (
            <video
              key={product.video}
              src={product.video}
              poster={poster}
              preload="none"
              autoPlay
              loop
              muted
              playsInline
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
              onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
            />
          )}
          {promoActive && (
            <span className="absolute left-2 top-2 rounded-md bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground tabular-nums">
              -{product.discountPercent}%
            </span>
          )}
          {isSoldOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <span className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground">{t('product.outOfStock')}</span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col px-3 pt-3">
          <h3 className="min-h-[2.75em] text-sm font-medium leading-snug text-foreground line-clamp-2">{name}</h3>
          {product.rating || product.salesCount ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              {product.rating ? (
                <>
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                  <span className="tabular-nums">{product.rating.toFixed(1)}</span>
                </>
              ) : null}
              {product.rating && product.salesCount ? <span aria-hidden="true">·</span> : null}
              {product.salesCount ? <span>{formatCount(product.salesCount)} {t('promo.sold')}</span> : null}
            </p>
          ) : null}
        </div>
      </Link>

      <div className="flex items-end justify-between gap-1 px-3 pb-3 pt-2">
        <div className="min-w-0">
          <p className={cn('whitespace-nowrap text-base font-semibold leading-tight tabular-nums', promoActive ? 'text-destructive' : 'text-foreground')}>
            {priceMain}
          </p>
          {priceRef && <p className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">{priceRef}</p>}
          {promoActive && (
            <p className="whitespace-nowrap text-xs text-muted-foreground line-through tabular-nums">
              {splitPrice(formatPrice(originalPrice, currency))[0]}
            </p>
          )}
        </div>
        {!isSoldOut && (
          <button
            type="button"
            onClick={handleAddToCart}
            className={cn(iconBtn, '-mr-1 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90')}
            aria-label={`${t('product.addToCart')}: ${name}`}
            title={t('product.addToCart')}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleToggleFavorite}
        aria-pressed={isFavorite}
        className={cn(
          iconBtn,
          'absolute right-1 top-1 bg-background/90 hover:text-primary',
          isFavorite ? 'text-primary' : 'text-muted-foreground',
        )}
        aria-label={isFavorite ? t('card.aria.removeFav') : t('card.aria.addFav')}
        title={isFavorite ? t('card.aria.removeFav') : t('card.aria.addFav')}
      >
        <Heart className={cn('h-5 w-5', isFavorite && 'fill-current')} aria-hidden="true" />
      </button>
    </article>
  );
};

export default CompactProductCard;
