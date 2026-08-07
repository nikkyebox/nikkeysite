import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { cdnVideo } from '@/services/cloudinaryService';

interface CompactProductCardProps {
  product: Product;
}

/** Formata contagem grande de forma compacta (ex: 1234 -> "1.2K"). */
const formatCount = (n: number): string => {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
};

/** Card denso estilo Temu: só imagem, nome, preço e ações mínimas — para grades com muitos itens por linha. */
const CompactProductCard: React.FC<CompactProductCardProps> = ({ product }) => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user } = useUser();
  const { toast } = useToast();
  const { selectedCountry } = useLanguage();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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
  const isSoldOut = product.stock && !product.stock.unlimited && product.stock.quantity === 0;
  const name = productEnglishName(product);

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.email) {
      toast({ title: 'Entre para favoritar', variant: 'destructive' });
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

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSoldOut) return;
    addToCart(product, firstVariant?.id || 'small', 1, firstVariant?.label);
    toast({ title: 'Adicionado ao carrinho', description: name });
  };

  return (
    <article
      onClick={() => navigate(`/produto/${product.id}`)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          navigate(`/produto/${product.id}`);
        }
      }}
      role="link"
      tabIndex={0}
      aria-label={`${name} — ${formatPrice(price, currency)}`}
      className="product-depth-card group cursor-pointer overflow-hidden rounded-2xl border border-pink-100/80 bg-white shadow-sm transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 hover:-translate-y-1.5 hover:border-pink-200 hover:shadow-2xl hover:shadow-pink-200/40 flex flex-col"
    >
      <div
        className="aspect-square bg-gradient-to-br from-white via-pink-50/35 to-fuchsia-50/50 relative overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {product.video && product.videoCover ? (
          /* Vídeo é a capa — toca direto, sem precisar de hover. Poster cobre
             até o vídeo carregar. Passa por `cdnVideo`: o card tem ~300px, mas
             o arquivo original tem 2,4 MB e era baixado inteiro na home. */
          <video
            key={product.video}
            src={cdnVideo(product.video, 480)}
            poster={product.thumbnail || product.image}
            preload="none"
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
            onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
          />
        ) : product.video ? (
          <>
            {/* Poster sempre visível — vídeo só carrega/toca no hover para não travar a página */}
            <img
              src={product.thumbnail || product.image}
              alt={name}
              loading="lazy"
              className={`absolute inset-0 w-full h-full object-contain p-3 group-hover:scale-[1.04] transition-all duration-500 ${isHovered ? 'opacity-0' : 'opacity-100'}`}
            />
            {isHovered && (
              <video
                key={product.video}
                src={cdnVideo(product.video, 480)}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
              />
            )}
          </>
        ) : (
          <img
            src={product.thumbnail || product.image}
            alt={name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-contain p-3 group-hover:scale-[1.06] group-hover:-rotate-1 transition-transform duration-500"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
        {promoActive && (
          <span className="absolute left-2 top-2 rounded-lg bg-gradient-to-r from-red-500 to-pink-500 px-2 py-1 text-[10px] font-black text-white shadow-md">
            -{product.discountPercent}%
          </span>
        )}
        <button
          onClick={handleToggleFavorite}
          className={cn(
            'absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl backdrop-blur-md transition-all duration-300',
            isFavorite
              ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/25'
              : 'bg-white/85 text-slate-500 shadow-sm ring-1 ring-white/80 hover:scale-105 hover:text-pink-500'
          )}
          aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        >
          <Heart className={cn('w-4 h-4', isFavorite && 'fill-current')} />
        </button>
        {isSoldOut && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-[11px] font-black text-red-600">ESGOTADO</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        <p className="mb-1.5 min-h-[2.5em] text-[13px] font-bold leading-snug text-slate-700 line-clamp-2">{name}</p>
        {(product.rating || product.salesCount) ? (
          <div className="mb-2 flex items-center gap-1 text-[10px] text-slate-500">
            {product.rating ? (
              <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {product.rating.toFixed(1)}
              </span>
            ) : null}
            {product.rating && product.salesCount ? <span className="text-gray-300">·</span> : null}
            {product.salesCount ? <span>{formatCount(product.salesCount)} vendidos</span> : null}
          </div>
        ) : (
          <div className="mb-1.5" />
        )}
        <div className="mt-auto flex items-end justify-between gap-1">
          <div>
            <p className={cn('text-base font-black leading-none tracking-tight', promoActive ? 'text-red-600' : 'text-pink-600')}>
              {formatPrice(price, currency)}
            </p>
            {promoActive && (
              <p className="text-[10px] text-gray-400 line-through leading-none mt-0.5">
                {formatPrice(originalPrice, currency)}
              </p>
            )}
          </div>
          {!isSoldOut && (
            <button
              onClick={handleAddToCart}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-500 text-white shadow-md shadow-pink-500/20 transition-all duration-300 hover:scale-105 hover:rotate-3 hover:shadow-lg"
              aria-label="Adicionar ao carrinho"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export default CompactProductCard;
