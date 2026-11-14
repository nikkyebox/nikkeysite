import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingCart, Heart, Share2, Star } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import ProductGallery from '@/components/products/ProductGallery';
import ProductReviews from '@/components/products/ProductReviews';
import { useProducts } from '@/context/ProductsContext';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { wishlistService } from '@/services/wishlistService';
import { reviewService } from '@/services/reviewService';
import { registrarEvento } from '@/services/eventosService';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';
import { getTranslatedProductDesc, getTranslatedProductFlavor } from '@/data/translations';
import { i18nDesc } from '@/utils/productI18n';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { effectiveYen, baseYen, hasDiscount, getVariants } from '@/utils/pricing';
import { convertYen as fxConvert } from '@/services/fxService';
import { productEnglishName } from '@/utils/productName';
import ProductJsonLd from '@/components/ProductJsonLd';
import { useSeo } from '@/hooks/useSeo';
import DeliveryEstimateBadge from '@/components/products/DeliveryEstimate';
import StockUrgency from '@/components/products/StockUrgency';
import { recentlyViewed } from '@/utils/recentlyViewed';
import { promoCampaignService } from '@/services/promoCampaignService';
import { safeStorage } from '@/utils/storage';
import { trackViewItem } from '@/lib/analytics';

const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user } = useUser();
  const { toast } = useToast();
  const { t, language, selectedCountry } = useLanguage();
  const { products, loading: productsLoading } = useProducts();

  const baseProduct = products.find(p => p.id === id);
  // Resgate promocional armado sem "manter desconto inicial": a página exibe o
  // preço ORIGINAL do produto qualificante — coerente com o que o carrinho vai
  // cobrar. armPending valida o ?promo= já no primeiro acesso à página.
  const [promoTick, setPromoTick] = useState(0);
  useEffect(() => {
    const bump = () => setPromoTick((t) => t + 1);
    window.addEventListener('promo-pricing-changed', bump);
    return () => window.removeEventListener('promo-pricing-changed', bump);
  }, []);
  useEffect(() => { promoCampaignService.armPending(); }, [id]);
  const product = React.useMemo(() => {
    if (!baseProduct) return baseProduct;
    try {
      const raw = safeStorage.getItem('promo_full_price');
      if (!raw) return baseProduct;
      const flag = JSON.parse(raw);
      return flag && flag.productId === baseProduct.id && (baseProduct.discountPercent || 0) > 0
        ? { ...baseProduct, discountPercent: 0 }
        : baseProduct;
    } catch {
      return baseProduct;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseProduct, promoTick]);
  const productVariants = product ? getVariants(product) : [];
  const [selectedSize, setSelectedSize] = useState<string>('small');
  const selectedVariant = productVariants.find((v) => v.id === selectedSize) || productVariants[0];
  // Estoque limitado no admin ("Quantidade específica") vira teto do seletor
  // — sem isso o cliente marca 6, 7... com só 5 disponíveis, paga no Stripe
  // e o pedido cai em revisão manual (o servidor recusa, mas depois de cobrar).
  const stockLimit = product?.stock && !product.stock.unlimited
    ? Math.max(0, Math.floor(Number(product.stock.quantity) || 0))
    : null;
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(
    user?.email ? wishlistService.isInWishlist(user.email, id || '') : false
  );

  // SEO: cada produto ganha título/descrição/imagem/canonical próprios.
  // Antes TODAS as páginas de produto exibiam o mesmo título — péssimo p/ Google.
  useSeo(product ? {
    title: `${productEnglishName(product)} | NikkeyBox`,
    description: (i18nDesc(product, language) || product.description || '').slice(0, 160) || undefined,
    image: product.gallery?.[0] || product.image || product.thumbnail,
    canonicalPath: `/produto/${product.id}`,
    type: 'product',
  } : {});

  // Registra que o usuário abriu este produto (coleta para futuras recomendações).
  // Só dispara quando o ID do produto muda — não a cada re-render da tela.
  useEffect(() => {
    if (product) {
      registrarEvento('viu_produto', product.id, product.category);
      const vs = getVariants(product);
      trackViewItem({
        item_id: product.id,
        item_name: product.name,
        item_category: product.category,
        // O evento dispara na abertura, antes de qualquer escolha de tamanho:
        // o preço rastreado é o da primeira variante. Antes o argumento era
        // omitido e o mesmo valor saía por acidente, via fallback interno.
        price: baseYen(product, vs[0]?.id ?? 'small'),
      }, 'JPY');
      if (vs.length && !vs.some((v) => v.id === selectedSize)) setSelectedSize(vs[0].id);
      // Rastreia visualização no painel de visitantes
      import('@/services/visitorService').then(({ visitorService }) => {
        visitorService.trackProduct(product.id, product.name).catch(() => {});
      });
      recentlyViewed.track(product.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- registra a visualização uma vez por produto; incluir product ou selectedSize contaria visualizações extras
  }, [product?.id]);

  // Enquanto os produtos carregam, evita piscar "não encontrado".
  if (!product && productsLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">{t('productDetail.loading')}</p>
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">{t('productDetail.notFound')}</h1>
          <Button onClick={() => navigate('/produtos')}>{t('productDetail.back')}</Button>
        </div>
      </Layout>
    );
  }

  const translatedName = productEnglishName(product);
  const translatedDesc = i18nDesc(product, language) || getTranslatedProductDesc(product.id, t);
  const translatedFlavor = getTranslatedProductFlavor(product.id, t);

  const isEuro = ['Portugal', 'França', 'Itália', 'Espanha'].includes(selectedCountry);
  const currency = getCurrencyByCountry(selectedCountry);
  
  const convertYen = (yen: number) => fxConvert(yen, currency);
  const getDisplayPrice = (size: string) => convertYen(effectiveYen(product, size));

  const currentPrice = getDisplayPrice(selectedSize);
  const promoActive = hasDiscount(product);
  const originalPrice = convertYen(baseYen(product, selectedSize));
  const productRating = reviewService.getProductRating(product.id);
  const images = product.gallery && product.gallery.length > 0 ? product.gallery : [product.image];

  // Restrição de destino
  const isJapanDest = selectedCountry === 'Japão';
  const deliveryBlocked =
    (product.deliveryRestrict === 'exterior-only' && isJapanDest) ||
    (product.deliveryRestrict === 'japan-only' && !isJapanDest);

  const restrictKey = product.deliveryRestrict as 'exterior-only' | 'japan-only' | undefined;
  const restrictTexts = {
    'exterior-only': { title: t('productDetail.restrict.exteriorTitle'), detail: t('productDetail.restrict.exteriorDetail') },
    'japan-only': { title: t('productDetail.restrict.japanTitle'), detail: t('productDetail.restrict.japanDetail') },
  };
  const deliveryBlockTitle  = restrictKey ? restrictTexts[restrictKey].title : '';
  const deliveryBlockDetail = restrictKey ? restrictTexts[restrictKey].detail : '';
  const deliveryBlockBtn    = restrictKey ? t('productDetail.restrict.btn') : '';

  const handleAddToCart = () => {
    if (deliveryBlocked) {
      toast({ title: '🚫 ' + deliveryBlockTitle, variant: 'destructive' });
      return;
    }
    const finalQuantity = stockLimit != null ? Math.min(quantity, stockLimit) : quantity;
    if (stockLimit != null && stockLimit <= 0) {
      toast({ title: t('productDetail.soldOut'), variant: 'destructive' });
      return;
    }
    addToCart(product, selectedSize, finalQuantity, selectedVariant?.label);
    toast({
      title: t('productDetail.added'),
      description: `${translatedName} (${selectedVariant?.label || ''}) x${finalQuantity}`,
    });
  };

  const handleToggleFavorite = () => {
    if (!user?.email) {
      toast({
        title: t('productDetail.loginRequired'),
        description: t('productDetail.loginFavorite'),
        variant: "destructive",
      });
      return;
    }

    if (isFavorite) {
      wishlistService.removeFromWishlist(user.email, product.id);
      setIsFavorite(false);
      toast({
        title: t('productDetail.removedFavorite'),
        description: `${translatedName}`,
      });
    } else {
      wishlistService.addToWishlist(user.email, {
        productId: product.id,
        productName: translatedName,
        productImage: product.image,
        productPrice: product.prices.small,
      });
      setIsFavorite(true);
      toast({
        title: t('productDetail.addedFavorite'),
        description: translatedName,
      });
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    const text = `${translatedName} 🍯`;

    if (navigator.share) {
      navigator.share({ title: translatedName, text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast({
        title: t('productDetail.linkCopied'),
        description: t('productDetail.linkCopiedDesc'),
      });
    }
  };

  return (
    <Layout>
      <ProductJsonLd product={product} country={selectedCountry} rating={productRating} />
      <div className="container mx-auto px-4 pt-4">
        {/* Volta para onde o cliente estava (busca, filtro, rolagem). Sem
            histórico interno (link direto), cai na lista de produtos. */}
        <Button
          variant="ghost"
          onClick={() => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate('/produtos')}
          className="-ml-3 h-11 gap-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('productDetail.back')}
        </Button>
      </div>

      <section className="bg-background pb-12 pt-4">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-fade-in motion-reduce:animate-none">
              <div>
                <ProductGallery
                  images={images}
                  productName={translatedName}
                  video={product.video}
                  videoCover={product.videoCover}
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-primary">
                  {t(`product.category.${['cosmeticos','acessorios','doces','papelaria','eletronicos','masculino','vestuario','higiene'].includes(product.category || '') ? product.category : 'importado'}`)}
                </p>

                <h1 className="mb-4 font-display text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">{translatedName}</h1>
                
                {productRating.totalReviews > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "w-5 h-5",
                            i < Math.floor(productRating.averageRating)
                              ? "text-yellow-500 fill-yellow-500"
                              : "text-gray-300"
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {productRating.averageRating.toFixed(1)} ({productRating.totalReviews} {t('productDetail.reviews')})
                    </span>
                  </div>
                )}

                {/* Seletor de tamanho/variante */}
                {productVariants.length > 1 && (
                  <div className="mb-6">
                    <span className="block text-sm font-semibold text-muted-foreground mb-2">{t('productDetail.chooseSize')}</span>
                    <div className="flex flex-wrap gap-2">
                      {productVariants.map((v) => {
                        const active = v.id === selectedSize;
                        return (
                          <button
                            type="button"
                            key={v.id}
                            onClick={() => setSelectedSize(v.id)}
                            aria-pressed={active}
                            className={cn(
                              'min-h-11 rounded-lg border px-4 py-2 text-left text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:border-primary/50'
                            )}
                          >
                            {v.label}
                            <span className="block text-xs font-normal text-muted-foreground">
                              {formatPrice(convertYen(effectiveYen(product, v.id)), currency)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mb-6 border-b pb-4 border-border/50">
                  <span className="block text-sm font-semibold text-muted-foreground mb-1">{t('productDetail.unitPrice')}</span>
                  {promoActive ? (
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-3xl font-semibold tabular-nums text-destructive">{formatPrice(currentPrice, currency)}</span>
                        <span className="text-base text-muted-foreground line-through tabular-nums">
                          {formatPrice(originalPrice, currency)}
                        </span>
                        <span className="rounded-md bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                          {t('productDetail.offBadge').replace('{pct}', String(product.discountPercent))}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-3xl font-semibold tabular-nums text-foreground">
                        {formatPrice(currentPrice, currency)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <span id="pd-qty-label" className="mb-2 block text-sm font-medium">{t('productDetail.quantity')}</span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center rounded-lg border border-border" role="group" aria-labelledby="pd-qty-label">
                      <button
                        type="button"
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        aria-label={t('productDetail.decrease')}
                        className="flex h-11 w-11 items-center justify-center rounded-l-lg text-lg transition-colors duration-150 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        −
                      </button>
                      <output className="min-w-10 text-center font-semibold tabular-nums" aria-live="polite">{quantity}</output>
                      <button
                        type="button"
                        onClick={() => setQuantity(q => stockLimit != null ? Math.min(stockLimit, q + 1) : q + 1)}
                        disabled={stockLimit != null && quantity >= stockLimit}
                        aria-label={t('productDetail.increase')}
                        className="flex h-11 w-11 items-center justify-center rounded-r-lg text-lg transition-colors duration-150 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-xl font-semibold tabular-nums text-foreground">
                      {formatPrice(currentPrice * quantity, currency)}
                    </div>
                  </div>
                  {stockLimit != null && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {t('productDetail.maxStock').replace('{n}', String(stockLimit)).replace('{unidade}', stockLimit === 1 ? t('productDetail.unitSingular') : t('productDetail.unitPlural'))}
                    </p>
                  )}
                </div>

                {/* Aviso de restrição de destino */}
                {deliveryBlocked && (
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-xl px-4 py-3 mb-4">
                    <span className="text-2xl">🚫</span>
                    <div>
                      <p className="font-bold text-red-700 dark:text-red-400 text-sm">{deliveryBlockTitle}</p>
                      <p className="text-xs text-red-600/80 dark:text-red-500/80">{deliveryBlockDetail}</p>
                    </div>
                  </div>
                )}
                {/* Badge importado */}
                {product.origin === 'importado' && (
                  <div className="inline-flex items-center gap-1.5 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
                    {t('productDetail.imported')}
                  </div>
                )}

                {/* Prazo de entrega estimado (por país) + urgência de estoque baixo */}
                {!deliveryBlocked && (
                  <DeliveryEstimateBadge country={selectedCountry} className="mb-4" />
                )}
                <StockUrgency stock={product.stock} className="mb-4" />

                <div className="flex gap-3 mb-6">
                  <Button
                    onClick={handleAddToCart}
                    size="lg"
                    disabled={deliveryBlocked}
                    className={`flex-1 gap-2 ${deliveryBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <ShoppingCart className="w-5 h-5" />
                    {deliveryBlocked ? deliveryBlockBtn : t('productDetail.addToCart')}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleToggleFavorite}
                    aria-pressed={isFavorite}
                    aria-label={isFavorite ? t('card.aria.removeFav') : t('card.aria.addFav')}
                    title={isFavorite ? t('card.aria.removeFav') : t('card.aria.addFav')}
                    className={cn('w-11 px-0', isFavorite && 'border-primary text-primary')}
                  >
                    <Heart className={cn('h-5 w-5', isFavorite && 'fill-current')} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleShare}
                    aria-label={t('productDetail.share')}
                    title={t('productDetail.share')}
                    className="w-11 px-0"
                  >
                    <Share2 className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </div>

                {translatedDesc.trim() && (
                  <div className="border-t border-border pt-6">
                    <h2 className="mb-3 text-base font-semibold">{t('productDetail.about')}</h2>
                    <div className="max-w-prose space-y-3 text-base leading-relaxed text-muted-foreground">
                      {translatedDesc.split('\n').filter((line) => line.trim() !== '').map((line, i) => <p key={i}>{line}</p>)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-16">
              <ProductReviews productId={product.id} productName={translatedName} />
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default ProductDetail;
