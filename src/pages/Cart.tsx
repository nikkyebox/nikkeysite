import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShoppingBag, ArrowRight, Trash2, Tag, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import CartItemComponent from '@/components/cart/CartItem';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { useProducts } from '@/context/ProductsContext';
import { useLanguage } from '@/context/LanguageContext';
import { useUser, Coupon } from '@/context/UserContext';
import { useNavigate } from 'react-router-dom';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { effectiveYen } from '@/utils/pricing';
import { convertYen as fxConvert } from '@/services/fxService';
import { POINTS } from '@/services/pointsService';
import { affiliateService, Affiliate } from '@/services/affiliateService';
import { couponService as globalCouponService } from '@/services/couponService';
import { promoCampaignService } from '@/services/promoCampaignService';
import { safeStorage } from '@/utils/storage';
import WelcomeCouponBanner from '@/components/WelcomeCouponBanner';
import { taxDisclosure } from '../../shared/tax-disclosure.js';

// Converte um afiliado num "cupom" aplicável (carrega o código para gerar comissão)
const affiliateToCoupon = (aff: Affiliate, productId?: string | null): Coupon => ({
  id: `aff-${aff.code}`,
  code: aff.code,
  description: `Indicação de ${aff.ownerName} — ${aff.discountPercent}% OFF`,
  discount: aff.discountPercent,
  discountType: 'percentage',
  expiresAt: aff.expiresAt,
  isUsed: false,
  affiliateCode: aff.code,
  affiliateProductId: productId || undefined,
});

const Cart: React.FC = () => {
  const { items, clearCart, addToCart } = useCart();
  const { products } = useProducts();
  const { t, language, selectedCountry, setSelectedCountry } = useLanguage();
  const { isAuthenticated, validateProfileCoupon, coupons, user } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [showCouponList, setShowCouponList] = useState(false);
  // Produto da campanha promocional. `null` para cupom comum, que vale para
  // todos os itens sem preço promocional.
  const [promoProductId, setPromoProductId] = useState<string | null>(null);
  // Como o desconto da campanha se compõe, para explicar no resumo em vez de
  // mostrar só "Cupom (PROMO-A1B2) −15%", que não diz nada ao cliente.
  const [promoBreakdown, setPromoBreakdown] = useState('');

  // Os pontos são aplicados só na etapa de revisão do pedido — no carrinho fica 0.
  const [pointsToUse, setPointsToUse] = useState<number>(0);

  // Cupons do perfil que estão válidos (para sugerir ao clicar no campo)
  const availableCoupons = coupons.filter(
    (c) => !c.isUsed && new Date(c.expiresAt) > new Date()
  );

  const applyCouponObject = (coupon: Coupon) => {
    setActiveCoupon(coupon);
    setCouponCode('');
    setCouponError('');
    setShowCouponList(false);
  };

  // Aplica um cupom: primeiro tenta o cupom PESSOAL (Meus Cupons), depois um
  // código de AFILIADO/influencer (público e reutilizável, gera comissão).
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');

    const code = couponCode.trim();
    if (!code) return;

    // 1) Cupom pessoal (precisa estar logado e possuir o cupom)
    if (isAuthenticated) {
      const personal = validateProfileCoupon(code, productSubtotalYen);
      if (personal.valid && personal.coupon) {
        applyCouponObject(personal.coupon);
        return;
      }
    }

    // 2) Cupom global criado no painel admin (público, carrega do Firestore)
    const globalResult = await globalCouponService.validateCouponAsync(code, user?.email || undefined, productSubtotalYen);
    if (globalResult.valid && globalResult.coupon) {
      const gc = globalResult.coupon;
      applyCouponObject({
        id: `global-${gc.code}-${Date.now()}`,
        code: gc.code,
        description: gc.description || `Cupom ${gc.code}`,
        discount: gc.type === 'percent' ? (gc.discountPercent || gc.discount || 0) : gc.discount,
        discountType: gc.type === 'fixed' ? 'fixed' : 'percentage',
        expiresAt: gc.expiryDate,
        isUsed: false,
        freeShipping: gc.freeShipping,
      });
      return;
    }

    // 3) Código de afiliado/influencer (público)
    const aff = await affiliateService.validate(code);
    if (aff.valid && aff.affiliate) {
      // Quando digitado manualmente (não via link de produto), não há productId
      applyCouponObject(affiliateToCoupon(aff.affiliate, null));
      safeStorage.setItem('affiliate_ref', aff.affiliate.code);
      safeStorage.removeItem('affiliate_ref_product');
      return;
    }

    // 4) Falhou
    setActiveCoupon(null);
    setCouponError(
      isAuthenticated
        ? t('cart.couponInvalid')
        : t('cart.couponLoggedOut')
    );
  };

  // Aplica automaticamente o código de indicação vindo do link (?ref=CODE)
  useEffect(() => {
    const ref = safeStorage.getItem('affiliate_ref');
    if (ref && !activeCoupon) {
      const productId = safeStorage.getItem('affiliate_ref_product') || null;
      affiliateService.validate(ref).then((res) => {
        if (res.valid && res.affiliate) {
          setActiveCoupon(affiliateToCoupon(res.affiliate, productId));
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Produto do link da campanha (?add=ID): entra no carrinho sozinho. Sem isto o
  // e-mail levava para a página do produto e ainda era preciso achar "adicionar
  // ao carrinho" — degrau em que a campanha morria.
  useEffect(() => {
    const addId = searchParams.get('add');
    if (!addId || products.length === 0) return;
    if (items.some((i) => i.product.id === addId)) return;
    const produto = products.find((p) => p.id === addId);
    if (!produto) return;
    // Mesma convenção do card da vitrine: primeira variante, ou 'small' nos
    // produtos antigos que ainda usam `prices.small`/`prices.large`.
    const variante = produto.variants?.[0];
    addToCart(produto, variante?.id || 'small', 1, variante?.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, products, items]);

  // Campanha promocional (?promo=CODE): armPending (compartilhado com a página
  // do produto) valida e arma preço original/brinde/pontos; aqui aplicamos só
  // o cupom % quando a mecânica é desconto.
  useEffect(() => {
    if (activeCoupon) return;
    let cancelled = false;
    promoCampaignService.armPending().then((c) => {
      if (cancelled || !c) return;
      if (c.mechanic === 'discount') {
        const pct = Math.max(1, Math.min(90, c.discountPct || 0));
        // O produto da campanha fica guardado à parte: sem ele o desconto virava
        // um cupom percentual comum e caía sobre o carrinho INTEIRO, enquanto o
        // servidor só o aplica ao produto da campanha
        // (api/_lib/commerce.js: `campaign?.productId === productId`). O cliente
        // mostrava um total e o servidor cobrava outro.
        setPromoProductId(c.productId || null);
        // Nome do cupom em vez do código interno: o cliente recebeu "cupom
        // AGORA15" no e-mail, não "PROMO-A1B2". O código de verdade continua indo
        // ao servidor por `promo_applied`, gravado pelo próprio armPending.
        const rotulo = c.couponLabel || c.code;
        const base = c.keepProductDiscount
          ? (products.find((p) => p.id === c.productId)?.discountPercent || 0)
          : 0;
        setPromoBreakdown(
          base > 0
            ? `Dois descontos somados neste link: ${base}% já embutidos no preço do produto e ${pct}% do cupom ${rotulo} aplicados agora. O cupom vale uma única vez.`
            : `Cupom ${rotulo} aplicado pelo link: ${pct}% de desconto, válido uma única vez.`
        );
        setActiveCoupon({
          id: `promo-${c.code}`,
          code: rotulo,
          description: c.tagline || `Promoção ${rotulo}`,
          discount: pct,
          discountType: 'percentage',
          expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
          isUsed: false,
        });
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const handleRemoveCoupon = () => {
    // Cupom de campanha: desarma o resgate inteiro (inclusive o preço original),
    // senão o cliente ficaria sem o desconto da página E sem a promoção.
    if (activeCoupon?.id?.startsWith('promo-')) {
      safeStorage.removeItem('promo_applied');
      safeStorage.removeItem('pending_promo');
      safeStorage.removeItem('pending_promo_gift');
      safeStorage.removeItem('pending_promo_points');
      safeStorage.removeItem('promo_full_price');
      window.dispatchEvent(new Event('promo-pricing-changed'));
    }
    setPromoProductId(null);
    setPromoBreakdown('');
    setActiveCoupon(null);
  };

  // Desconto a partir do cupom do perfil (porcentagem ou valor fixo)
  const computeDiscount = (coupon: Coupon, subtotal: number): number => {
    if (coupon.freeShipping) return 0; // frete é tratado no checkout
    if (coupon.discountType === 'percentage') {
      return subtotal * (coupon.discount / 100);
    }
    return Math.min(coupon.discount, subtotal);
  };

  // Calculations in correct currency
  const isEuro = ['Portugal', 'França', 'Itália', 'Espanha'].includes(selectedCountry);
  const currency = getCurrencyByCountry(selectedCountry);

  const isPromoItem = (item: (typeof items)[0]) => item.product.id.endsWith('_promo');

  // Subtotal dos itens em promoção (cupom NÃO se aplica a eles)
  const promoSubtotal = items.reduce(
    (sum, item) => (!item.freeGift && isPromoItem(item)) ? sum + fxConvert(effectiveYen(item.product, item.size), currency) * item.quantity : sum, 0
  );
  // Subtotal dos itens regulares (base do cupom)
  const regularSubtotal = items.reduce(
    (sum, item) => (!item.freeGift && !isPromoItem(item)) ? sum + fxConvert(effectiveYen(item.product, item.size), currency) * item.quantity : sum, 0
  );

  const baseTotalPrice = promoSubtotal + regularSubtotal;
  const hasPromoItems = promoSubtotal > 0;

  // Base do desconto. Campanha de produto (`promo-`) incide SÓ sobre o produto
  // dela, igual ao servidor faz em `api/_lib/commerce.js`. Cupom comum — e o de
  // recuperação de carrinho — incide sobre todos os itens sem preço promocional.
  const baseDoCupom = promoProductId
    ? items.reduce(
      (sum, item) => (!item.freeGift && item.product.id === promoProductId)
        ? sum + fxConvert(effectiveYen(item.product, item.size), currency) * item.quantity
        : sum, 0)
    : regularSubtotal;
  const discountAmount = activeCoupon ? computeDiscount(activeCoupon, baseDoCupom) : 0;

  // Resgate de pontos: 1 ponto = ¥1, limitado ao valor dos produtos (em ¥)
  const convertYen = (yen: number) => fxConvert(yen, currency);
  const productSubtotalYen = items.reduce((sum, item) => item.freeGift ? sum : sum + effectiveYen(item.product, item.size) * item.quantity, 0);
  const availablePoints = user?.points || 0;
  const maxRedeemable = Math.min(availablePoints, Math.floor(productSubtotalYen / POINTS.yenPerPoint));
  const redeemPoints = Math.max(0, Math.min(pointsToUse, maxRedeemable));
  const pointsDiscount = convertYen(redeemPoints * POINTS.yenPerPoint);

  // Zera qualquer resgate antigo — os pontos são escolhidos na revisão do pedido.
  useEffect(() => {
    safeStorage.setItem('redeem_points', '0');
  }, []);

  const subtotalWithDiscount = Math.max(0, baseTotalPrice - discountAmount - pointsDiscount);
  
  // Tax calculations (Estimated only, NOT added to grandTotal)
  let federalTax = 0;
  let icmsTax = 0;
  let estimatedTax = 0;
  let taxLabel = '';
  
  if (selectedCountry === 'Brasil') {
    // Brazil import taxes subject to customs authority determination — no numeric estimate displayed
    federalTax = 0;
    icmsTax = 0;
    estimatedTax = 0;
    taxLabel = '';
  } else if (isEuro) {
    const rates: Record<string, number> = { Portugal: 0.23, França: 0.20, Itália: 0.22, Espanha: 0.21 };
    const rate = rates[selectedCountry] || 0.20;
    estimatedTax = subtotalWithDiscount * rate;
    taxLabel = `IVA / VAT Estimado (${Math.round(rate * 100)}%)`;
  }

  // Grand total ONLY has items subtotal (no taxes added!)
  const grandTotal = subtotalWithDiscount;

  return (
    <Layout>
      <WelcomeCouponBanner context="cart" />
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {t('cart.title')} {selectedCountry === 'Japão' ? '🇯🇵' : selectedCountry === 'Brasil' ? '🇧🇷' : selectedCountry === 'Portugal' ? '🇵🇹' : selectedCountry === 'França' ? '🇫🇷' : selectedCountry === 'Itália' ? '🇮🇹' : selectedCountry === 'Espanha' ? '🇪🇸' : ''}
            </h1>
            <p className="text-muted-foreground text-lg">
              {items.length > 0
                ? `${items.length} ${items.length === 1 ? t('cart.items') : t('cart.items_plural')}`
                : t('cart.empty')
              }
            </p>
          </div>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          {items.length > 0 ? (
            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 min-w-0">
              {/* Cart Items List */}
              <div className="lg:col-span-2 space-y-4 min-w-0">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="font-sans text-xl font-bold text-foreground">
                    {t('cart.yourProducts')}
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/produtos')}
                      className="font-semibold text-xs"
                    >
                      {t('cart.continueShopping')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearCart}
                      className="text-muted-foreground hover:text-destructive font-semibold"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t('cart.clear')}
                    </Button>
                  </div>
                </div>



                {items.map((item) => {
                  // Desconto proporcional por item regular (cupom não se aplica a itens promo)
                  const itemIsPromo = item.product.id.endsWith('_promo');
                  const itemSubtotal = item.freeGift || itemIsPromo ? 0
                    : fxConvert(effectiveYen(item.product, item.size), currency) * item.quantity;
                  const itemDiscount = (!itemIsPromo && activeCoupon && regularSubtotal > 0)
                    ? discountAmount * (itemSubtotal / regularSubtotal)
                    : 0;
                  return (
                    <CartItemComponent
                      key={`${item.product.id}-${item.size}${item.freeGift ? '-gift' : ''}`}
                      item={item}
                      couponDiscount={itemDiscount}
                    />
                  );
                })}

                {/* PromoGift progress reminders */}
                {items.filter(i => !i.freeGift && (i.product.promoGift?.buyQuantity ?? 0) > 0 && i.product.promoGift?.giftProductId).map(item => {
                  const pg = item.product.promoGift!;
                  const qtyMet = item.quantity >= pg.buyQuantity;
                  const yenMet = !pg.minOrderValueYen || productSubtotalYen >= pg.minOrderValueYen;
                  if (qtyMet && yenMet) return null;
                  const missingQty = qtyMet ? 0 : pg.buyQuantity - item.quantity;
                  const missingVal = !yenMet ? formatPrice(convertYen(pg.minOrderValueYen! - productSubtotalYen), currency) : null;
                  return (
                    <div key={`reminder-${item.product.id}`} className="bg-purple-50 dark:bg-purple-950/20 border border-dashed border-purple-300 dark:border-purple-700 rounded-xl p-3 flex items-start gap-2.5">
                      <span className="text-xl shrink-0">🎁</span>
                      <div>
                        <p className="text-sm font-bold text-purple-800 dark:text-purple-200">
                          Ganhe <span className="underline">{pg.giftProductName}</span> grátis!
                        </p>
                        <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                          {missingQty > 0 && !missingVal && `Compre mais ${missingQty} unidade(s) deste produto.`}
                          {missingQty === 0 && missingVal && `Adicione mais ${missingVal} em produtos no carrinho.`}
                          {missingQty > 0 && missingVal && `Compre mais ${missingQty} unidade(s) e adicione mais ${missingVal} no total.`}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Customs notice for international orders */}
                {selectedCountry !== 'Japão' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mt-6">
                    <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-sans font-bold text-sm text-amber-800">
                        {taxDisclosure(language).title}
                      </h4>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        {taxDisclosure(language).body}
                      </p>
                    </div>
                  </div>
                )}

                {/* Japan Local Shipping Banner */}
                {selectedCountry === 'Japão' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 mt-6">
                    <span className="text-xl">📦</span>
                    <div>
                      <h4 className="font-sans font-bold text-sm text-emerald-800">
                        Envio Nacional Seguro (Japan Post / Yamato / Sagawa)
                      </h4>
                      <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                        Seu pedido será embalado e despachado diretamente de nossa loja em Hiroshima. O frete será calculado na próxima etapa com base no tamanho das caixas e na província selecionada.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Order Summary Card */}
              <div className="lg:col-span-1 min-w-0">
                <div className="bg-card rounded-2xl border border-border p-6 sticky top-24 space-y-6 shadow-sm min-w-0">
                  <h3 className="font-sans text-lg font-bold text-foreground">{t('cart.summary')}</h3>

                  {/* Coupon Application Input + lista de cupons disponíveis */}
                  {!activeCoupon && (
                    <form onSubmit={handleApplyCoupon} className="space-y-2 relative">
                      <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" /> {t('cart.coupon')}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={isAuthenticated ? t('cart.couponPlaceholder') : t('cart.couponLoggedOut')}
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value)}
                          onFocus={() => setShowCouponList(true)}
                          onBlur={() => setTimeout(() => setShowCouponList(false), 150)}
                          className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background uppercase font-bold"
                        />
                        <Button type="submit" variant="secondary" className="px-4 text-xs font-bold">
                          {t('cart.apply')}
                        </Button>
                      </div>
                      {couponError && <p className="text-xs text-red-500 font-semibold">{couponError}</p>}

                      {/* Dropdown de cupons do perfil */}
                      {showCouponList && isAuthenticated && availableCoupons.length > 0 && (
                        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground px-3 pt-2 pb-1">
                            {t('cart.yourCoupons')}
                          </p>
                          {availableCoupons.map((coupon) => {
                            const preview = computeDiscount(coupon, baseTotalPrice);
                            const label = coupon.freeShipping
                              ? 'Frete Grátis'
                              : coupon.discountType === 'percentage'
                              ? `${coupon.discount}% OFF`
                              : `¥${coupon.discount.toLocaleString()} OFF`;
                            return (
                              <button
                                key={coupon.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyCouponObject(coupon)}
                                className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors border-t border-border/50 first:border-t-0"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-primary text-sm">{coupon.code}</span>
                                  <span className="text-xs font-bold text-green-600">
                                    {coupon.freeShipping ? label : `-${formatPrice(preview, currency)}`}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">{coupon.description} · {label}</p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {showCouponList && isAuthenticated && availableCoupons.length === 0 && (
                        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg p-3">
                          <p className="text-xs text-muted-foreground text-center">
                            {t('cart.noCoupons')}
                          </p>
                        </div>
                      )}
                    </form>
                  )}

                  {/* Os pontos de fidelidade são aplicados na última etapa (revisão do pedido). */}
                  {isAuthenticated && availablePoints > 0 && (
                    <div className="bg-purple-50 dark:bg-purple-950/20 border border-dashed border-purple-300 rounded-xl p-3 text-xs text-purple-700 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>Você tem <b>{availablePoints} pontos</b>. Use como desconto na etapa final da compra.</span>
                    </div>
                  )}

                  {/* Price Summary List */}
                  <div className="space-y-3 pt-2 border-t border-border">

                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('cart.subtotal')}</span>
                      <span className="font-semibold text-gray-800">{formatPrice(baseTotalPrice, currency)}</span>
                    </div>

                    {activeCoupon && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm text-green-600 font-bold bg-green-50/50 p-2 rounded-lg border border-dashed border-green-200">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3.5 h-3.5 shrink-0" /> Cupom ({activeCoupon.code})
                            {activeCoupon.discountType === 'percentage' ? ` −${activeCoupon.discount}%` : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            −{formatPrice(discountAmount, currency)}
                            <button
                              onClick={handleRemoveCoupon}
                              className="text-red-500 hover:text-red-700 ml-1 text-xs"
                              title="Remover cupom"
                            >
                              ×
                            </button>
                          </span>
                        </div>
                        {promoBreakdown && (
                          <p className="text-[11px] text-purple-700 dark:text-purple-300 font-medium bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 rounded-lg px-2 py-1.5 leading-snug">
                            🎁 {promoBreakdown}
                          </p>
                        )}
                        {hasPromoItems && regularSubtotal === 0 && (
                          <p className="text-[11px] text-pink-600 font-semibold bg-pink-50 border border-pink-200 rounded-lg px-2 py-1.5 leading-snug">
                            ⚠️ Todos os itens já têm desconto promocional. O cupom não foi aplicado.
                          </p>
                        )}
                        {hasPromoItems && regularSubtotal > 0 && (
                          <p className="text-[11px] text-blue-600 font-medium bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 leading-snug">
                            ℹ️ Cupom aplicado apenas aos itens sem promoção ({formatPrice(regularSubtotal, currency)}). Itens com preço promocional não acumulam desconto.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Tax displays only as estimated warnings for international destinations */}
                    {selectedCountry !== 'Japão' && estimatedTax > 0 && (
                      <div className="bg-pink-50/50 dark:bg-pink-950/10 border border-pink-200/60 rounded-xl p-3 space-y-2 mt-2">
                        <div className="flex justify-between text-xs font-bold text-orange-850 dark:text-pink-300">
                          <span>{taxLabel}</span>
                          <span>{formatPrice(estimatedTax, currency)}</span>
                        </div>
                        <p className="text-[10px] text-pink-700 dark:text-pink-400 leading-relaxed font-semibold">
                          ⚠️ <strong>Lembrete:</strong> Este imposto é apenas uma estimativa aproximada. Ele <strong>NÃO</strong> foi somado ao total geral do seu carrinho e poderá ser cobrado pela alfândega local na chegada do pacote ao país de destino.
                        </p>
                      </div>
                    )}

                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('cart.shipping')}</span>
                      <span className="text-xs text-muted-foreground">{t('cart.shippingCalc')}</span>
                    </div>

                    <div className="flex justify-between pt-3 border-t border-border">
                      <span className="font-black text-lg text-gray-800">{t('cart.total')}</span>
                      <div className="text-right">
                        {discountAmount > 0 && (
                          <p className="text-sm text-muted-foreground line-through">
                            {formatPrice(baseTotalPrice, currency)}
                          </p>
                        )}
                        <span className="font-black text-2xl text-pink-600">
                          {formatPrice(grandTotal, currency)}
                        </span>
                        {discountAmount > 0 && (
                          <p className="text-[11px] text-green-600 font-bold mt-0.5">
                            Você economiza {formatPrice(discountAmount, currency)}
                          </p>
                        )}
                        {selectedCountry !== 'Japão' && !discountAmount ? (
                          <p className="text-[10px] text-gray-400 font-semibold mt-0.5">ou até 12x no cartão</p>
                        ) : selectedCountry === 'Japão' && !discountAmount ? (
                          <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Pague via PayPay ou Depósito</p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Antes o botão principal levava sempre ao fluxo com conta, e
                      quem não estava logado era redirecionado direto para
                      /cadastro pelo Checkout. A saída sem cadastro existia, mas
                      como texto cinza sublinhado embaixo do aviso de frete.
                      O funil mostrava o resultado: 146 visitas ao carrinho e 139
                      ao cadastro — quase todo mundo empurrado a criar conta.
                      Os dois caminhos agora têm o mesmo peso visual. */}
                  {isAuthenticated ? (
                    <Button
                      className="w-full btn-primary rounded-xl py-6 text-lg font-bold"
                      onClick={() => navigate('/checkout', { state: { coupon: activeCoupon } })}
                    >
                      {t('cart.checkout')}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        className="w-full btn-primary rounded-xl py-6 text-lg font-bold"
                        onClick={() => navigate('/checkout', { state: { coupon: activeCoupon, isGuest: true } })}
                      >
                        {t('cart.checkoutGuest')}
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full rounded-xl py-5 text-base font-semibold"
                        onClick={() => navigate('/checkout', { state: { coupon: activeCoupon } })}
                      >
                        {t('cart.checkoutAccount')}
                      </Button>
                      <p className="text-center text-[11px] text-muted-foreground">
                        {t('cart.accountPerk')}
                      </p>
                    </div>
                  )}

                  <p className="text-center text-xs text-muted-foreground">
                    {selectedCountry === 'Japão'
                      ? '🏠 Envio direto de Hiroshima - Frete rápido e seguro.'
                      : '✈️ Despachado de Hiroshima com entrega expressa pelos Correios.'
                    }
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-24 h-24 rounded-full bg-secondary mx-auto mb-6 flex items-center justify-center">
                <ShoppingBag className="w-12 h-12 text-muted-foreground" />
              </div>
              <h2 className="font-display text-2xl font-bold text-foreground mb-2">
                {t('cart.empty')}
              </h2>
              <p className="text-muted-foreground mb-8">
                {t('cart.emptyDesc')}
              </p>
              <Button asChild className="btn-primary rounded-full px-8">
                <Link to="/produtos">
                  {t('cart.viewProducts')}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>
      </Layout>
  );
};

export default Cart;
