import React, { useEffect, useState } from 'react';
import { ShoppingCart, Sparkles, ArrowLeft, AlertTriangle, CheckCircle, Clock, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { useProducts } from '@/context/ProductsContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useLanguage } from '@/context/LanguageContext';
import { getCurrencyByCountry, formatPrice } from '@/utils/currency';
import { convertYen } from '@/services/fxService';
import { ActivePromo, ScheduledNextPromo, PROMO_TYPES } from '@/types/promotion';

const BOUGHT_KEY = (id: string) => `promo_bought_${id}`;

// Lê contagem respeitando limitResetAt — se o contador foi gravado antes do reset, ignora.
function readBought(key: string, limitResetAt?: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    // Formato novo: {"count":1,"setAt":timestamp}
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      if (limitResetAt && parsed.setAt < limitResetAt) return 0;
      return parsed.count ?? 0;
    }
    // Formato legado: número direto
    if (limitResetAt) return 0; // qualquer entrada legada é anterior ao reset
    return parseInt(raw) || 0;
  } catch { return 0; }
}

function writeBought(key: string, count: number) {
  localStorage.setItem(key, JSON.stringify({ count, setAt: Date.now() }));
}

function useCountdown(expiresAt: number | null | undefined, endedLabel: string) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!expiresAt) { setLabel(''); return; }
    const update = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) { setLabel(endedLabel); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(d > 0 ? `${d}d ${h}h ${m}m ${s}s` : `${h}h ${m}m ${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [expiresAt, endedLabel]);
  return label;
}

async function tryActivateNext(next: ScheduledNextPromo) {
  if (!db) return;
  try {
    const expiresAt = next.durationDays ? Date.now() + next.durationDays * 86400000 : null;
    await setDoc(doc(db, 'siteContent', 'homePromotion'), { ...next, expiresAt, nextPromo: null });
  } catch { /* sem auth de usuário comum — admin ativa manualmente */ }
}

const Promotion: React.FC = () => {
  const [promo, setPromo] = useState<ActivePromo | null | undefined>(undefined);
  const [qty, setQty] = useState(1);
  const [mainImg, setMainImg] = useState(0);
  const { addToCart, items: cartItems } = useCart();
  const { products } = useProducts();
  const { toast } = useToast();
  const { t, selectedCountry } = useLanguage();
  const countdown = useCountdown(promo?.expiresAt, t('promo.endedShort'));

  useEffect(() => {
    if (!db) { setPromo(null); return; }
    getDoc(doc(db, 'siteContent', 'homePromotion')).then(snap => {
      if (!snap.exists()) { setPromo(null); return; }
      const data = snap.data() as ActivePromo;
      // Verifica expiração por data
      const expiredByDate = data.expiresAt ? data.expiresAt < Date.now() : false;
      // Verifica esgotamento por quantidade
      const expiredByQty = data.maxProducts != null && (data.soldCount ?? 0) >= data.maxProducts;

      if (expiredByDate || expiredByQty) {
        if (data.nextPromo) tryActivateNext(data.nextPromo).then(() => setPromo(null));
        else setPromo(null);
      } else {
        setPromo(data);
      }
    }).catch(() => setPromo(null));
  }, []);

  if (promo === undefined) return (
    <Layout>
      <div className="container mx-auto px-4 py-24 flex justify-center">
        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    </Layout>
  );

  if (!promo) return (
    <Layout>
      <div className="container mx-auto px-4 py-24 text-center space-y-4">
        <Sparkles className="w-12 h-12 text-muted-foreground mx-auto" />
        <h1 className="text-2xl font-bold">{t('promo.noneActive')}</h1>
        <p className="text-muted-foreground">{t('promo.comeBack')}</p>
        <Button asChild variant="outline"><Link to="/produtos"><ArrowLeft className="w-4 h-4 mr-2" />{t('shippingPage.viewProducts')}</Link></Button>
      </div>
    </Layout>
  );

  const product = products.find(p => p.id === promo.productId);
  const currency = getCurrencyByCountry(selectedCountry);
  const promoPriceLocal = convertYen(promo.promoPriceYen, currency);
  const originalPriceLocal = convertYen(promo.originalPriceYen, currency);
  const promoType = PROMO_TYPES.find(pt => pt.value === promo.type);
  const typeLabel = promoType?.labelKey ? t(promoType.labelKey) : (promoType?.label ?? promo.type);
  const discount = promo.discountPct > 0 ? promo.discountPct : (promo.originalPriceYen > 0 ? Math.round((1 - promo.promoPriceYen / promo.originalPriceYen) * 100) : 0);

  const boughtKey = BOUGHT_KEY(promo.productId);
  const alreadyBought = readBought(boughtKey, promo.limitResetAt ?? undefined);
  // Quantas unidades promo deste produto já estão no carrinho (não confirmadas ainda)
  const inCartPromoQty = cartItems
    .filter(i => i.product.id === promo.productId + '_promo')
    .reduce((sum, i) => sum + i.quantity, 0);
  // Limite real = limite por pessoa - já comprados (pedidos anteriores) - já no carrinho agora
  const remaining = Math.max(0, promo.limitPerPerson - alreadyBought - inCartPromoQty);

  const gallery: string[] = product?.gallery?.length ? product.gallery : [promo.productImage].filter(Boolean);

  const isExpired = promo.expiresAt ? promo.expiresAt < Date.now() : false;
  const isSoldOut = promo.maxProducts != null && (promo.soldCount ?? 0) >= promo.maxProducts;
  const stockLeft = promo.maxProducts != null ? Math.max(0, promo.maxProducts - (promo.soldCount ?? 0)) : null;

  const promoQty = Math.min(qty, remaining);
  const overflowQty = Math.max(0, qty - remaining);
  const totalLocal = promoPriceLocal * promoQty + originalPriceLocal * overflowQty;

  const handleAddToCart = () => {
    if (isExpired) { toast({ title: t('promo.ended'), variant: 'destructive' }); return; }
    if (isSoldOut) { toast({ title: `😔 ${t('promo.soldOut')}`, description: t('promo.soldOutDesc'), variant: 'destructive' }); return; }

    // Se o limite já foi atingido entre pedidos anteriores + carrinho atual, tudo vai como regular
    if (remaining === 0 && inCartPromoQty > 0) {
      toast({
        title: t('promo.limitReached'),
        description: t('promo.limitInCart').replace('{qty}', String(inCartPromoQty)),
        variant: 'destructive',
      });
      if (product) addToCart(product, 'small', qty);
      return;
    }

    const baseProduct = product || {
      id: promo.productId, name: promo.productName, image: promo.productImage,
      thumbnail: promo.productImage, gallery: [promo.productImage],
      category: 'especial', description: '',
      prices: { small: promo.originalPriceYen ?? 0 },
    };

    // Adiciona unidades com preço promo (até o limite) — preço em ¥ para o carrinho converter corretamente
    // variants: [] força baseYen a usar prices.small em vez de variants do produto original
    // discountPercent: 0 evita aplicar desconto duplo sobre o preço já reduzido
    // NÃO incrementa o contador aqui — só conta após o pedido ser finalizado (OrderReview)
    if (promoQty > 0) {
      const promoItem = {
        ...baseProduct,
        id: promo.productId + '_promo',
        name: promo.productName + ' ✨',
        prices: { small: promo.promoPriceYen ?? 0, large: promo.promoPriceYen ?? 0 },
        variants: [],
        discountPercent: 0,
        promoLimit: promo.limitPerPerson, // max qty no carrinho para este item promo
      };
      addToCart(promoItem as Parameters<typeof addToCart>[0], 'small', promoQty);
    }

    // Adiciona excedente com preço original
    if (overflowQty > 0 && product) {
      addToCart(product, 'small', overflowQty);
      if (promoQty > 0) {
        toast({
          title: `✨ ${t('promo.mixedTitle').replace('{promo}', String(promoQty)).replace('{regular}', String(overflowQty))}`,
          description: t('promo.overflowDesc').replace('{limit}', String(promo.limitPerPerson)),
        });
      } else {
        toast({
          title: t('promo.addedTitle'),
          description: t('promo.overflowOnly').replace('{qty}', String(overflowQty)).replace('{name}', promo.productName),
        });
      }
    } else if (promoQty > 0) {
      toast({ title: `${t('promo.addedExcl')} 🎉`, description: `${promoQty}x ${promo.productName}` });
    }
  };

  const resetPromoLimit = () => {
    localStorage.removeItem(boughtKey);
    // Também limpa formato legado
    Object.keys(localStorage).filter(k => k.startsWith('promo_bought_')).forEach(k => localStorage.removeItem(k));
    window.location.reload();
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4" /> {t('promo.backToStore')}
        </Link>

        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Galeria */}
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden aspect-square bg-secondary border border-border">
              <img src={gallery[mainImg] || promo.productImage} alt={promo.productName} className="w-full h-full object-cover" />
              {discount > 0 && (
                <div className="absolute top-4 left-4 bg-red-500 text-white text-sm font-black px-3 py-1.5 rounded-full shadow">-{discount}%</div>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.map((img, i) => (
                  <button key={i} onClick={() => setMainImg(i)}
                    className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-colors ${i === mainImg ? 'border-primary' : 'border-border'}`}>
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-gray-900 font-black text-sm uppercase px-3 py-1.5 rounded-full">
              <Sparkles className="w-4 h-4 animate-spin" style={{ animationDuration: '3s' }} />
              {typeLabel}
            </div>

            <h1 className="font-display text-3xl lg:text-4xl font-bold text-foreground leading-tight">{promo.productName}</h1>

            {product?.description && <p className="text-muted-foreground leading-relaxed">{product.description}</p>}

            {/* Countdown */}
            {promo.expiresAt && countdown && (
              <div className={`flex items-center gap-2 text-sm font-semibold ${isExpired || countdown === t('promo.endedShort') ? 'text-red-600' : 'text-purple-600'}`}>
                <Clock className="w-4 h-4 shrink-0" />
                {countdown === t('promo.endedShort') ? t('promo.ended') : `${t('promo.endsIn')} ${countdown}`}
              </div>
            )}

            {/* Estoque disponível */}
            {promo.maxProducts != null && (
              <div className={`rounded-xl p-3 border text-sm font-semibold flex flex-col gap-1 ${isSoldOut ? 'bg-red-50 border-red-300 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                <div className="flex items-center justify-between">
                  <span>{isSoldOut ? `😔 ${t('promo.soldOutAll')}` : `📦 ${t('promo.stockLeft').replace('{qty}', String(stockLeft))}`}</span>
                  <span className="text-xs font-normal opacity-70">{promo.soldCount ?? 0}/{promo.maxProducts} {t('promo.sold')}</span>
                </div>
                {!isSoldOut && (
                  <div className="h-2 bg-amber-200 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, ((promo.soldCount ?? 0) / promo.maxProducts) * 100)}%` }} />
                  </div>
                )}
              </div>
            )}

            {/* Preços */}
            <div className="space-y-1">
              {originalPriceLocal > 0 && (
                <div className="text-sm text-muted-foreground line-through">
                  {t('promo.was')} {formatPrice(originalPriceLocal, currency, true)}{(promo.originalPriceYen ?? 0) > 0 && ` (¥${(promo.originalPriceYen ?? 0).toLocaleString()})`}
                </div>
              )}
              <div className="text-4xl font-black text-green-600">
                {promoPriceLocal > 0 ? formatPrice(promoPriceLocal, currency, true) : t('promo.priceUnavailable')}
                {(promo.promoPriceYen ?? 0) > 0 && <span className="text-base font-normal text-muted-foreground ml-2">(¥{(promo.promoPriceYen ?? 0).toLocaleString()})</span>}
              </div>
              {discount > 0 && (
                <div className="inline-block bg-red-100 text-red-700 text-sm font-bold px-3 py-1 rounded-full">
                  {t('promo.saving')} {formatPrice(originalPriceLocal - promoPriceLocal, currency, true)}
                </div>
              )}
            </div>

            {/* Limite por pessoa */}
            <div className={`flex items-start gap-2 text-sm p-3 rounded-lg border ${remaining > 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {remaining > 0
                ? <><CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{t('promo.firstUnits1')} <strong>{promo.limitPerPerson}</strong> {t('promo.firstUnits2')}</span></>
                : <div className="flex-1 flex flex-col gap-1.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        {inCartPromoQty > 0
                          ? t('promo.inCartNote').replace('{qty}', String(inCartPromoQty)).replace('{limit}', String(promo.limitPerPerson))
                          : t('promo.limitHit').replace('{limit}', String(promo.limitPerPerson))
                        }
                      </span>
                    </div>
                    {inCartPromoQty === 0 && (
                      <button onClick={resetPromoLimit} className="self-start text-[11px] underline text-red-500 hover:text-red-700">{t('promo.resetLimit')}</button>
                    )}
                  </div>
              }
            </div>

            {/* Preview do pedido quando excede limite */}
            {overflowQty > 0 && !isExpired && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-purple-700"><Info className="w-4 h-4" /> {t('promo.orderSummary')}</div>
                {promoQty > 0 && <div className="text-purple-700">{promoQty}x {t('promo.at')} {formatPrice(promoPriceLocal, currency, true)} <span className="text-xs">{t('promo.promoPriceTag')}</span></div>}
                <div className="text-purple-700">{overflowQty}x {t('promo.at')} {formatPrice(originalPriceLocal, currency, true)} <span className="text-xs">{t('promo.originalPriceTag')}</span></div>
                <div className="font-bold text-orange-800 border-t border-purple-200 pt-1">{t('cart.total')}: {formatPrice(totalLocal, currency, true)}</div>
              </div>
            )}

            {/* Seletor de quantidade */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{t('promo.quantity')}</span>
              <div className="flex items-center border border-border rounded-lg overflow-hidden">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3 py-2 hover:bg-secondary transition-colors text-lg font-bold">−</button>
                <span className="px-4 py-2 font-semibold min-w-[3rem] text-center">{qty}</span>
                <button onClick={() => setQty(q => Math.min(99, q + 1))} className="px-3 py-2 hover:bg-secondary transition-colors text-lg font-bold">+</button>
              </div>
            </div>

            <Button size="lg" onClick={handleAddToCart} disabled={isExpired || countdown === t('promo.endedShort') || isSoldOut} className="w-full gap-2 text-base font-bold">
              <ShoppingCart className="w-5 h-5" />
              {isExpired || countdown === t('promo.endedShort')
                ? t('promo.ended')
                : isSoldOut
                  ? t('ui.promo.soldOut')
                  : `${t('promo.addToCart')} — ${formatPrice(totalLocal, currency, true)}`}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              * {t('promo.footnote').replace('{limit}', String(promo.limitPerPerson))}
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Promotion;
