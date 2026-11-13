import { safeStorage } from '@/utils/storage';
import React, { useState, useEffect, useMemo } from 'react';
import { emailServiceSimple } from '@/services/emailServiceSimple';
import { useNavigate, useLocation } from 'react-router-dom';
import { Package, ArrowRight, Printer, CreditCard, Smartphone, MapPin, User, Phone, Mail, CheckCircle, Tag, Copy, AlertCircle, ExternalLink, X } from 'lucide-react';
import { couponService as globalCouponService } from '@/services/couponService';
import { QRCodeSVG } from 'qrcode.react';
import { buildPixPayload } from '@/utils/pixPayload';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/context/LanguageContext';
import { useProducts } from '@/context/ProductsContext';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { effectiveYen } from '@/utils/pricing';
import { convertYen as fxConvert, loadFxRates, getRates, getRateSource } from '@/services/fxService';
import { clientCheckoutTotals, checkoutLineFromItem, couponYenFor, type CheckoutCoupon } from '@/utils/checkoutTotals';
import { negotiationService } from '@/services/negotiationService';
import { psFeeWaiver } from '@/utils/psFeeWaiver';
import { productService } from '@/services/productService';
import { earnedPointsForOrder, POINTS, pointsMultiplierForSpend } from '@/services/pointsService';
import { recentProductSpendYen } from '@/utils/loyaltySpend';
import { productEnglishName } from '@/utils/productName';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { firebaseSyncService } from '@/services/firebaseSyncService';
import { paymentSettingsService } from '@/services/paymentSettingsService';
import { referralService } from '@/services/referralService';
import { calcBrazilTax, calcImportTax } from '@/utils/taxRules';
import { promoCampaignService } from '@/services/promoCampaignService';
import { thermalPrintService } from '@/services/thermalPrintService';
import StripeCardForm from '@/components/checkout/StripeCardForm';
import { prepareCheckout, type AuthoritativeCheckoutOrder, type CheckoutPaymentMethod } from '@/services/checkoutService';
import { getCountryConfig } from '@/data/worldCountries';
import { db } from '@/config/firebase';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { COUPONS_ENABLED, ORDER_CONFIRMATION_EMAIL_ENABLED, LOYALTY_POINTS_ENABLED } from '@/config/featureFlags';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


const OrderReview: React.FC = () => {
  const { items, clearCart } = useCart();
  const { refresh: refreshProducts } = useProducts();
  const { consumeCouponByCode, user, addPoints, addCoupon, orders } = useUser();
  const [pointsToUse, setPointsToUse] = useState<number>(() => {
    const v = Number(safeStorage.getItem('redeem_points'));
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();

  const formData = location.state?.formData;
  const shipping = location.state?.shipping;
  const [, setCouponDiscount] = useState<number>(0);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; freeShipping?: boolean } | null>(
    (location.state?.coupon as { code: string; freeShipping?: boolean } | null | undefined) ?? null,
  );
  const psFeeYen: number = location.state?.psFeeYen || 0;
  const psFeeDiscountYen: number = location.state?.psFeeDiscountYen || 0;
  const shippingDiscountYen: number = location.state?.shippingDiscountYen || 0;
  const negotiationId: string | null = location.state?.negotiationId || null;
  const isGuest: boolean = !!location.state?.isGuest;
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState(() => {
    return 'card';
  });
  const [paySettings, setPaySettings] = useState<import('@/services/paymentSettingsService').PaymentSettings>({
    wiseLink: '', wiseEnabled: false,
    pixKey: '', pixReceiverName: 'NikkeyBox', pixCity: 'Sao Paulo',
    pixEnabled: false, cardEnabled: true,
    contactPhone: '',
  });

  // O pedido é criado no servidor antes de abrir o modal. Nenhuma mutação
  // financeira depende do navegador.
  const [paymentModal, setPaymentModal] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<AuthoritativeCheckoutOrder | null>(null);
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const [orderCreating, setOrderCreating] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  // A cotação usada aqui pode ter sido carregada minutos/horas atrás (no
  // boot do app, em LanguageContext). O servidor busca uma cotação NOVA no
  // momento de criar o pedido (`api/orders.js`) — se a de mercado se mexeu
  // nesse intervalo, o total exibido aqui diverge do que é cobrado. Busca de
  // novo ao entrar na revisão final para reduzir essa janela ao mínimo.
  const [, setFxRatesTick] = useState(0);
  useEffect(() => {
    loadFxRates().then(() => setFxRatesTick((v) => v + 1)).catch(() => {});
  }, []);

  useEffect(() => {
    paymentSettingsService.get().then((s) => {
      setPaySettings(s);
      // Se o método pré-selecionado (cartão, por padrão) estiver desativado,
      // troca automaticamente para o primeiro disponível.
      setPaymentMethod((current) => {
        const enabledByMethod: Record<string, boolean> = { pix: s.pixEnabled && formData?.country !== 'Japão', card: s.cardEnabled };
        if (enabledByMethod[current]) return current;
        return (['pix', 'card'] as const).find((m) => enabledByMethod[m]) || 'card';
      });
    });
  }, [formData?.country]);

  // Redirect if no form data or shipping
  useEffect(() => {
    if (!formData || !shipping) {
      navigate('/checkout');
    }
  }, [formData, shipping, navigate]);

  // Hook precisa executar mesmo durante o redirecionamento sem estado.
  const recentSpendYen = useMemo(() => recentProductSpendYen(orders), [orders]);

  if (!formData || !shipping) {
    return null;
  }

  const handlePrint = () => {
    window.print();
  };

  const isJapan = formData.country === 'Japão';
  const isEurope = ['Portugal', 'França', 'Itália', 'Espanha'].includes(formData.country);
  const isUsa = formData.country === 'Estados Unidos';
  const currency = getCurrencyByCountry(formData.country);

  const convertYen = (yen: number) => fxConvert(yen, currency);
  const convertYenExact = (yen: number) => fxConvert(yen, currency, true);

  // Subtotal dos produtos em ¥ (já com desconto promocional, sem frete) — base dos pontos
  const productSubtotalYen = items.reduce(
    (sum, item) => item.freeGift ? sum : sum + effectiveYen(item.product, item.size) * item.quantity, 0
  );

  // Conta do checkout: a MESMA do servidor (shared/checkout-totals.js), com os
  // dados desta tela. O total exibido é o que o servidor cobra.
  // Gasto dos últimos 3 meses-calendário, para o multiplicador de pontos.
  // A conta mora em `utils/loyaltySpend` porque o perfil mostra o MESMO nível.

  const pointsMultiplier = pointsMultiplierForSpend(recentSpendYen);

  // Pontos pagam só mercadoria. Resgate parcial convive com desconto na taxa;
  // apenas quando os pontos zeram toda a mercadoria a taxa PS volta ao valor
  // cheio, exatamente como a cotação autoritativa do servidor.
  const availablePoints = user?.points || 0;
  const couponYenForPoints = couponYenFor(
    items.map((i) => checkoutLineFromItem({ product: i.product, size: i.size, quantity: i.quantity, freeGift: i.freeGift })),
    (appliedCoupon ?? null) as CheckoutCoupon | null,
  );
  const maxRedeemable = Math.min(
    availablePoints,
    Math.max(0, Math.floor((productSubtotalYen - couponYenForPoints) / POINTS.yenPerPoint)),
  );
  const redeemPoints = Math.max(0, Math.min(pointsToUse, maxRedeemable));
  const pointsCoverAllProducts = productSubtotalYen > 0 && redeemPoints > 0 && productSubtotalYen - couponYenForPoints - redeemPoints <= 0;
  // Pontos que cobrem toda a mercadoria zeram o desconto da taxa PS (como no servidor).
  const effectivePsFeeDiscountYen = pointsCoverAllProducts ? 0 : psFeeDiscountYen;
  // Mesma função que `api/_lib/commerce.js` usa para creditar — o número que
  // aparece aqui é exatamente o que vai cair na conta do cliente, incluindo
  // o multiplicador de pontos pelo nível do cliente. Ganho de pontos
  // desativado (ver shared/featureFlags.js) — mesma flag lida pelo servidor.
  const earnedPoints = LOYALTY_POINTS_ENABLED
    ? earnedPointsForOrder(productSubtotalYen, redeemPoints * POINTS.yenPerPoint, pointsMultiplier)
    : 0;

  const isPix = paymentMethod === 'pix';
  // Frete em ¥: o desconto negociado sai do custo (não há frete grátis por cupom).
  const rawShippingYen = shipping.costYen ?? 0;
  const finalShippingYen = Math.max(0, rawShippingYen - shippingDiscountYen);
  const totals = clientCheckoutTotals({
    lines: items.map((i) => checkoutLineFromItem({ product: i.product, size: i.size, quantity: i.quantity, freeGift: i.freeGift })),
    coupon: (appliedCoupon ?? null) as CheckoutCoupon | null,
    redeemPoints,
    paymentMethod,
    currency,
    rates: { ...getRates(), source: getRateSource() },
    finalShippingYen,
    negotiatedPsDiscountYen: psFeeDiscountYen,
  });
  const baseTotalPrice = totals.display.subtotal;
  const couponDiscount = totals.display.couponDiscount;
  const pointsDiscount = totals.display.pointsDiscount;
  const paymentDiscount = totals.display.paymentDiscount;
  const finalShippingCost = totals.display.shipping;
  const psFeeDisplay = totals.display.psFee;
  const psFeeFinalYen = totals.psFeeYenCharged;
  const finalGrandTotal = totals.total;
  // Sem desconto por método de pagamento além do de cartão/PIX, já na conta.
  const pixDiscount = 0;
  const priceAfterPix = totals.display.products;

  // Taxes (Estimated only, NOT added to grand total)
  let federalTax = 0;
  let icmsTax = 0;
  let estimatedTax = 0;
  let taxLabel = '';

  if (formData.country === 'Brasil') {
    const br = calcBrazilTax(priceAfterPix);
    federalTax = br.federal;
    icmsTax = br.icms;
    estimatedTax = br.total;
    taxLabel = t('review.taxBr');
  } else {
    const r = calcImportTax(priceAfterPix, formData.country, formData.prefecture);
    estimatedTax = r.tax;
    taxLabel = r.labelKey
      ? Object.entries(r.labelVars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, v), t(r.labelKey))
      : r.label;
  }

  const taxAmount = estimatedTax; // Saved in mockOrder for administrative visibility


  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponError('');
    setCouponLoading(true);
    try {
      // 1. Profile coupon
      if (user?.coupons) {
        const found = user.coupons.find((coupon) => coupon.code?.toUpperCase() === code && !coupon.isUsed);
        if (found) {
          const isPromoItem = (item: (typeof items)[number]) => item.product.id.endsWith('_promo');
          const regularSubtotalYen = items.filter(i => !i.freeGift && !isPromoItem(i))
            .reduce((s, i) => s + effectiveYen(i.product, i.size) * i.quantity, 0);
          const regularSubtotal = items.filter(i => !i.freeGift && !isPromoItem(i))
            .reduce((s, i) => s + fxConvert(effectiveYen(i.product, i.size), currency) * i.quantity, 0);
          let disc = 0;
          if (found.discountType === 'percentage') disc = Math.round(regularSubtotal * (found.discount / 100) * 100) / 100;
          else disc = Math.min(found.discount, regularSubtotal);
          setCouponDiscount(disc);
          setAppliedCoupon(found);
          setCouponInput('');
          toast({ title: t('review.couponApplied').replace('{code}', code), description: `-${formatPrice(disc, currency)}` });
          return;
        }
      }
      // 2. Global Firestore coupon
      const isPromoItem = (item: (typeof items)[number]) => item.product.id.endsWith('_promo');
      const regularSubtotalYen = items.filter(i => !i.freeGift && !isPromoItem(i))
        .reduce((s, i) => s + effectiveYen(i.product, i.size) * i.quantity, 0);
      const globalResult = await globalCouponService.validateCouponAsync(code, user?.email || undefined, regularSubtotalYen);
      if (globalResult.valid && globalResult.coupon) {
        const gc = globalResult.coupon;
        const regularSubtotal = items.filter(i => !i.freeGift && !isPromoItem(i))
          .reduce((s, i) => s + fxConvert(effectiveYen(i.product, i.size), currency) * i.quantity, 0);
        let disc = 0;
        if (gc.type === 'percent') disc = Math.round(regularSubtotal * ((gc.discountPercent || gc.discount || 0) / 100) * 100) / 100;
        else disc = Math.min(gc.discount || 0, regularSubtotal);
        const couponObj = {
          id: `global-${gc.code}-${Date.now()}`,
          code: gc.code,
          description: gc.description || t('cart.couponFallbackDesc').replace('{code}', gc.code),
          discount: gc.type === 'percent' ? (gc.discountPercent || gc.discount || 0) : (gc.discount || 0),
          discountType: gc.type === 'fixed' ? 'fixed' : 'percentage',
          expiresAt: gc.expiryDate,
          isUsed: false,
          freeShipping: gc.freeShipping,
        };
        setCouponDiscount(disc);
        setAppliedCoupon(couponObj);
        setCouponInput('');
        toast({ title: t('review.couponApplied').replace('{code}', code), description: `-${formatPrice(disc, currency)}` });
        return;
      }
      setCouponError(t('review.couponInvalid'));
    } catch {
      setCouponError(t('review.couponError'));
    } finally {
      setCouponLoading(false);
    }
  };

  // Passo 1: monta os dados do pedido e abre o modal de pagamento (sem salvar nada ainda)
  const handleProceedToPayment = async () => {
    const iso = getCountryConfig(formData.country)?.iso.toUpperCase() || 'XX';
    const orderId = formData.country === 'Japão'
      ? `SC-JP-${Math.floor(100000 + Math.random() * 900000)}`
      : `SE-${iso}-${Math.floor(100000 + Math.random() * 900000)}`;

    setOrderCreating(true);
    try {
      const result = await prepareCheckout({
        orderId,
        paymentMethod: paymentMethod as CheckoutPaymentMethod,
        items: items
          .filter((item) => !item.freeGift)
          .map((item) => ({
            productId: item.product.id,
            variantId: item.size,
            quantity: item.quantity,
          })),
        customer: {
          name: formData.name,
          email: String(formData.email || user?.email || '').trim().toLowerCase(),
          phone: formData.phone || '',
          cpf: formData.cpf || '',
        },
        shippingAddress: {
          postalCode: formData.postalCode || '',
          prefecture: formData.prefecture || '',
          state: formData.state || '',
          city: formData.city || '',
          address: formData.address || '',
          building: formData.building || '',
          country: formData.country,
        },
        shippingCarrier: shipping.carrier,
        couponCode: appliedCoupon?.code || '',
        promoCode: safeStorage.getItem('promo_applied') || '',
        pointsToRedeem: redeemPoints,
        negotiationId: negotiationId || '',
        psFeeWaiverToken: psFeeWaiver.token(),
      });
      if (result.order.psFeeWaiverApplied === true) psFeeWaiver.clear();
      setPendingOrder(result.order);
      setStripeClientSecret(result.clientSecret || '');
      setPaymentModal(true);
    } catch (error) {
      const codigo = error instanceof Error ? error.message : '';
      const waiverInvalid = codigo === 'invalid_ps_fee_waiver' || codigo === 'ps_fee_waiver_already_used';
      if (waiverInvalid) psFeeWaiver.clear();
      const fxUnavailable = codigo === 'fx_rate_unavailable';
      toast({
        title: t('review.orderFailTitle'),
        description: waiverInvalid
          ? t('review.waiverInvalid')
          : fxUnavailable
            ? t('review.fxUnavailable')
            : codigo || t('review.checkItems'),
        variant: 'destructive',
      });
    } finally {
      setOrderCreating(false);
    }
  };

  // Passo 2: usuário confirmou o pagamento — agora salva tudo e navega
  // O servidor já persistiu o pedido. Este passo apenas encerra a experiência
  // local; estoque, cupons, pontos e promoções aguardam pagamento confirmado.
  const handleFinalizeOrder = () => {
    if (!pendingOrder) return;

    if (!isGuest) {
      const existingOrders = JSON.parse(safeStorage.getItem('sakura_orders') || '[]') as AuthoritativeCheckoutOrder[];
      const deduped = existingOrders.filter((order) => order.orderNumber !== pendingOrder.orderNumber);
      safeStorage.setItem('sakura_orders', JSON.stringify([pendingOrder, ...deduped]));
    }
    if (ORDER_CONFIRMATION_EMAIL_ENABLED && pendingOrder.paymentMethod !== 'card') {
      void emailServiceSimple.sendOrderConfirmation({ orderNumber: pendingOrder.orderNumber });
    }
    void thermalPrintService.printOrder(pendingOrder);

    clearCart();
    safeStorage.removeItem('redeem_points');
    safeStorage.removeItem('promo_applied');
    safeStorage.removeItem('pending_promo');
    safeStorage.removeItem('pending_promo_gift');
    safeStorage.removeItem('pending_promo_points');
    safeStorage.removeItem('promo_full_price');
    localStorage.removeItem('activeNegId');
    psFeeWaiver.clear();

    navigate('/order-confirmation', {
      state: {
        order: pendingOrder,
        isGuest,
      },
    });
  };

  return (
    <Layout>
      <div className="gradient-hero py-16 print:hidden">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {t('review.title')}
            </h1>
            <p className="text-muted-foreground text-lg">
              {isJapan 
                ? t('review.subJp')
                : t('review.subIntl')
              }
            </p>
          </div>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">

            {/* Print Button */}
            <div className="flex justify-end mb-6 print:hidden">
              <Button onClick={handlePrint} variant="outline" className="gap-2 font-semibold">
                <Printer className="w-4 h-4" />
                {t('review.printReceipt')}
              </Button>
            </div>

            <div className="lg:grid lg:grid-cols-3 lg:gap-8 min-w-0">

              {/* ── COLUNA ESQUERDA ── */}
              <div className="lg:col-span-2 space-y-6 min-w-0">

            {/* Order Items Summary */}
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <h2 className="font-sans text-xl font-bold text-foreground">
                  {isJapan ? t('review.productsJp') : t('review.productsIntl')}
                </h2>
              </div>

              <div className="space-y-4">
                {items.map((item) => {
                  const displayUnitPrice = item.freeGift ? 0 : convertYen(effectiveYen(item.product, item.size));
                  const displayItemPrice = displayUnitPrice * item.quantity;
                  const productName = productEnglishName(item.product);
                  return (
                    <div
                      key={`${item.product.id}-${item.size}${item.freeGift ? '-gift' : ''}`}
                      className={`flex items-center gap-4 pb-4 border-b border-border last:border-0${item.freeGift ? ' bg-purple-50 dark:bg-purple-950/20 rounded-lg px-2 pt-2' : ''}`}
                    >
                      <img
                        src={item.product.image}
                        alt={productName}
                        className="w-16 h-16 rounded-lg object-cover border border-gray-200"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground truncate">{productName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t('review.option')}: {item.freeGift ? `🎁 ${t('cartItem.promoGift')}` : (item.variantLabel || (item.size === 'small' ? t('review.small') : t('review.large')))} • {t('review.quantity')}: {item.quantity}x
                        </p>
                        {!item.freeGift && (
                          <p className="text-xs text-gray-400">
                            {t('review.unitPrice')}: {formatPrice(displayUnitPrice, currency)}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {item.freeGift ? (
                          <p className="font-bold text-base text-green-600">{t('cartItem.free')} 🎁</p>
                        ) : (
                          <p className="font-bold text-base text-foreground">
                            {formatPrice(displayItemPrice, currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Calculation breakdown */}
                <div className="pt-4 space-y-2.5 text-sm border-t border-border">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('review.subtotal')}</span>
                    <span>{formatPrice(baseTotalPrice, currency)}</span>
                  </div>

                  {/* Coupon input — desativado (ver featureFlags.ts) */}
                  {COUPONS_ENABLED && !appliedCoupon && (
                    <div className="bg-muted/40 border border-dashed border-border rounded-lg p-3 print:hidden">
                      <div className="flex items-center gap-2 mb-2">
                        <Tag className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">{t('review.haveCoupon')}</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponInput}
                          onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                          onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                          placeholder={t('review.couponPh')}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-mono uppercase"
                        />
                        <Button size="sm" variant="outline" onClick={handleApplyCoupon} disabled={couponLoading || !couponInput.trim()}>
                          {couponLoading ? '...' : t('review.apply')}
                        </Button>
                      </div>
                      {couponError && <p className="text-xs text-red-500 mt-1">{couponError}</p>}
                    </div>
                  )}

                  {COUPONS_ENABLED && couponDiscount > 0 && (
                    <div className="flex justify-between text-green-600 font-bold bg-green-50/50 p-2 rounded border border-dashed border-green-200">
                      <span className="flex items-center gap-2">
                        {t('review.couponDiscount')} {appliedCoupon ? `(${appliedCoupon.code})` : ''}
                        <button type="button" onClick={() => { setCouponDiscount(0); setAppliedCoupon(null); }} className="text-[10px] text-red-400 hover:text-red-600 underline font-normal print:hidden">{t('review.remove')}</button>
                      </span>
                      <span>-{formatPrice(couponDiscount, currency)}</span>
                    </div>
                  )}

                  {/* Resgate de pontos de fidelidade */}
                  {user && availablePoints > 0 && (
                    <div className="bg-purple-50 dark:bg-purple-950/20 border border-dashed border-purple-300 rounded-lg p-3 print:hidden">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4" /> {t('review.usePoints')} ({availablePoints} {t('review.available')})
                        </span>
                        <span className="text-[11px] text-purple-700">{t('review.pointRate')}</span>
                      </div>
                      <>
                        {pointsCoverAllProducts && psFeeDiscountYen > 0 && (
                          <p className="text-xs text-orange-700 dark:text-orange-400 leading-snug mb-2">
                            {t('review.pointsCoverNote')}
                            
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={0} max={maxRedeemable}
                            value={pointsToUse || ''}
                            onChange={(e) => setPointsToUse(Math.max(0, Math.min(maxRedeemable, Number(e.target.value) || 0)))}
                            placeholder="0"
                            className="w-24 px-2 py-1.5 rounded-lg border border-purple-300 bg-background text-sm"
                          />
                          <button type="button" onClick={() => setPointsToUse(maxRedeemable)}
                            className="text-xs font-semibold text-purple-700 hover:underline">{t('checkout.useMax')} ({maxRedeemable})</button>
                          {redeemPoints > 0 && (
                            <button type="button" onClick={() => setPointsToUse(0)}
                              className="text-xs text-muted-foreground hover:underline ml-auto">{t('review.clear')}</button>
                          )}
                        </div>
                        <p className="text-[11px] text-purple-700 mt-1.5">
                          {t('review.pointsOnlyProducts')}
                        </p>
                      </>
                    </div>
                  )}

                  {pointsDiscount > 0 && (
                    <div className="flex justify-between text-purple-700 font-bold bg-purple-50/60 p-2 rounded border border-dashed border-purple-200">
                      <span>{t('review.pointsDiscount')} ({redeemPoints} {t('review.ptsAbbr')})</span>
                      <span>-{formatPrice(pointsDiscount, currency)}</span>
                    </div>
                  )}

                  {paymentDiscount > 0 && (
                    <div className="flex justify-between text-green-700 font-bold bg-green-50/60 p-2 rounded border border-dashed border-green-200">
                      <span>{t('review.paymentDiscount')}</span>
                      <span>-{formatPrice(paymentDiscount, currency)}</span>
                    </div>
                  )}

                  {pixDiscount > 0 && (
                    <div className="flex justify-between text-pink-600 font-bold bg-pink-50 p-2 rounded border border-dashed border-pink-200">
                      <span>{t('review.pixExtra')}</span>
                      <span>-{formatPrice(pixDiscount, 'BRL')}</span>
                    </div>
                  )}

                  {user && earnedPoints > 0 && (
                    <div className="flex justify-between text-green-700 text-xs bg-green-50/60 p-2 rounded">
                      <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> {t('review.willEarn')}</span>
                      <span className="font-bold">+{earnedPoints} {t('review.ptsAbbr')}{pointsMultiplier > 1 && <span className="ml-1 inline-block bg-green-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">x{pointsMultiplier}</span>}</span>
                    </div>
                  )}

                  {/* Estimated international taxes (shown only as reminder, not summed) */}
                  {formData.country !== 'Japão' && estimatedTax > 0 && (
                    <div className="bg-pink-50/50 dark:bg-pink-950/10 border border-pink-200/60 rounded-xl p-3 space-y-2 mt-2">
                      <div className="flex justify-between text-xs font-bold text-orange-850 dark:text-pink-300">
                        <span>{taxLabel}</span>
                        <span>{formatPrice(estimatedTax, currency)}</span>
                      </div>
                      <p className="text-[10px] text-pink-700 dark:text-pink-400 leading-relaxed font-semibold">
                        ⚠️ <strong>{t('review.noteLabel')}</strong> {t('review.taxNote')}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-between text-muted-foreground">
                    <span>{isJapan ? t('review.freightLocal') : t('review.freightAir')} ({shipping.carrier})</span>
                    <span>{finalShippingCost === 0 ? t('order.shipping.free') : formatPrice(finalShippingCost, currency)}</span>
                  </div>

                  <div className="text-[10px] text-gray-400 text-right">
                    {isJapan ? t('review.domesticShipNote') : t('review.intlShipNote').replace('{country}', formData.country)} {t('review.estDelivery')} {shipping.estimatedDays} {t('review.bizDays')}
                  </div>

                  {psFeeYen > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('review.psFee')}</span>
                      <div className="text-right">
                        {effectivePsFeeDiscountYen > 0 && (
                          <span className="text-xs line-through text-muted-foreground mr-1">
                            {currency === 'JPY' ? `¥ ${psFeeYen.toLocaleString()}` : `${formatPrice(convertYenExact(psFeeYen), currency, true)} (¥ ${psFeeYen.toLocaleString()})`}
                          </span>
                        )}
                        <span className={effectivePsFeeDiscountYen > 0 ? 'text-green-600 font-semibold' : ''}>
                          {currency === 'JPY' ? `¥ ${psFeeFinalYen.toLocaleString()}` : `${formatPrice(psFeeDisplay, currency, true)} (¥ ${psFeeFinalYen.toLocaleString()})`}
                        </span>
                      </div>
                    </div>
                  )}


                  <div className="flex justify-between pt-3 border-t border-border font-black text-lg">
                    <span>{t('review.totalGeneral')}</span>
                    <span className="text-2xl text-pink-600">
                      {formatPrice(finalGrandTotal, currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer & Customs Info */}
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <h2 className="font-sans text-xl font-bold text-foreground">
                  {isJapan ? t('review.custInfoJp') : t('review.custInfoIntl')}
                </h2>
              </div>

              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground font-semibold">{t('review.fullName')}</Label>
                  <p className="font-bold text-gray-800 text-base">{formData.name}</p>
                </div>

                 {!isJapan && (
                   <div>
                     <Label className="text-muted-foreground font-semibold">{t('review.cpfCustoms')}</Label>
                     <p className="font-bold text-pink-600 text-base">{formData.cpf}</p>
                   </div>
                 )}

                <div>
                  <Label className="text-muted-foreground font-semibold">{t('review.phone')}</Label>
                  <p className="font-medium text-gray-800">{formData.phone}</p>
                </div>

                <div>
                  <Label className="text-muted-foreground font-semibold">{t('review.contactEmail')}</Label>
                  <p className="font-medium text-gray-800">{formData.email}</p>
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                  <h2 className="font-sans text-xl font-bold text-foreground">
                    {t('address.title')} ({
                      formData.country === 'Japão' ? 'Japão 🇯🇵' :
                      formData.country === 'Brasil' ? 'Brasil 🇧🇷' :
                      formData.country === 'Portugal' ? 'Portugal 🇵🇹' :
                      formData.country === 'França' ? 'França 🇫🇷' :
                      formData.country === 'Itália' ? 'Itália 🇮🇹' :
                      'Espanha 🇪🇸'
                    })
                  </h2>
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground">{t('review.postalCode')}</Label>
                    <p className="font-bold text-gray-800">〒 {formData.postalCode}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{isJapan ? t('review.province') : t('review.stateUf')}</Label>
                    <p className="font-medium text-gray-800">{formData.prefecture}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t('review.city')}</Label>
                    <p className="font-medium text-gray-800">{formData.city}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">{t('review.street')}</Label>
                  <p className="font-medium text-gray-800">{formData.address}</p>
                </div>
                {formData.building && (
                  <div>
                    <Label className="text-muted-foreground">{t('review.complement')}</Label>
                    <p className="font-medium text-gray-800">{formData.building}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8 print:hidden">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <h2 className="font-sans text-xl font-bold text-foreground">
                  {t('review.selectPayment')}
                </h2>
              </div>

              <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                <div className="space-y-4">
                    <>
                      {/* PIX direto. Fica DESLIGADO no painel: a remessa para o Japão
                          come IOF mais taxa de conversão. Pagar por outro caminho sem essas
                          taxas existe, mas não é este.

                          Quando desligado a opção não é desenhada. Um botão cinza
                          "em manutenção" num site novo o cliente lê como site quebrado,
                          e ele não vai deduzir sozinho que o PIX está logo acima.
                          O código fica: religar é trocar `pixEnabled` no painel.

                          Não precisa de guarda contra ficar selecionado e invisível: o
                          efeito da linha ~97 já troca para o primeiro método ativo. */}
                      {paySettings.pixEnabled && !isJapan && (
                      <div className={cn(
                        "flex items-start space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer",
                        paymentMethod === 'pix' ? "border-pink-500 bg-pink-50/50" : "border-border hover:border-gray-300"
                      )}>
                        <RadioGroupItem value="pix" id="pix" className="mt-1" />
                        <Label htmlFor="pix" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 mb-1">
                            <Smartphone className="w-5 h-5 text-pink-600" />
                            <span className="font-bold text-base text-gray-800">PIX</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {t('review.pixDesc')}
                          </p>
                        </Label>
                      </div>
                      )}

                      {/* Credit Card Option (Stripe) */}
                      {paySettings.cardEnabled ? (
                      <div className={cn(
                        "flex items-start space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer",
                        paymentMethod === 'card' ? "border-indigo-500 bg-indigo-50/50" : "border-border hover:border-gray-300"
                      )}>
                        <RadioGroupItem value="card" id="card" className="mt-1" />
                        <Label htmlFor="card" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 mb-1">
                            <CreditCard className="w-5 h-5 text-indigo-600" />
                            <span className="font-bold text-base text-gray-800">{t('review.creditCard')}</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {t('review.cardDesc')}
                          </p>
                        </Label>
                      </div>
                      ) : (
                        <div className="flex items-start space-x-3 p-4 rounded-xl border-2 border-border opacity-60 cursor-not-allowed">
                          <RadioGroupItem value="card" id="card" className="mt-1" disabled />
                          <Label htmlFor="card" className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <CreditCard className="w-5 h-5 text-gray-400" />
                              <span className="font-bold text-base text-gray-600">{t('review.creditCard')}</span>
                              <span className="text-[10px] bg-gray-400 text-white font-extrabold px-2 py-0.5 rounded-full uppercase">{t('review.maintenance')}</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {t('review.cardMaint')}
                            </p>
                          </Label>
                        </div>
                      )}
                    </>
                </div>
              </RadioGroup>
            </div>

            {/* Back Button */}
            <div className="print:hidden">
              <Button
                variant="outline"
                onClick={() => navigate('/checkout', { state: { formData, activeNegId: negotiationId } })}
                className="w-full rounded-xl py-5 text-base border-2"
              >
                {t('review.backEdit')}
              </Button>
            </div>

              </div>{/* end COLUNA ESQUERDA */}

              {/* ── COLUNA DIREITA STICKY ── */}
              <div className="lg:col-span-1 mt-6 lg:mt-0 min-w-0">
                <div className="sticky top-20 space-y-4 self-start min-w-0">

                  {/* Resumo de pagamento */}
                  <div className="bg-card rounded-2xl border-2 border-primary/20 shadow-lg p-5">
                    <h3 className="font-bold text-base text-foreground mb-4 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-primary" />
                      {t('review.summary')}
                    </h3>

                    <div className="space-y-2 text-sm">
                      {/* Itens */}
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t('review.items')} ({items.filter(i => !i.freeGift).length}x)</span>
                        <span>{formatPrice(baseTotalPrice, currency)}</span>
                      </div>

                      {COUPONS_ENABLED && couponDiscount > 0 && (
                        <div className="flex justify-between text-green-600 font-semibold">
                          <span>{t('review.coupon')} ({appliedCoupon?.code})</span>
                          <span>−{formatPrice(couponDiscount, currency)}</span>
                        </div>
                      )}

                      {pointsDiscount > 0 && (
                        <div className="flex justify-between text-purple-600 font-semibold">
                          <span>{t('review.points')} ({redeemPoints} {t('review.ptsAbbr')})</span>
                          <span>−{formatPrice(pointsDiscount, currency)}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-muted-foreground">
                        <span>{t('review.shipping')}</span>
                        <span>{finalShippingCost === 0 ? t('order.shipping.free') : formatPrice(finalShippingCost, currency)}</span>
                      </div>

                      {psFeeYen > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>{t('order.psFee')}</span>
                          <span className={effectivePsFeeDiscountYen > 0 ? 'text-green-600 font-semibold' : ''}>
                            {currency === 'JPY' ? `¥ ${psFeeFinalYen.toLocaleString()}` : `${formatPrice(psFeeDisplay, currency, true)} (¥ ${psFeeFinalYen.toLocaleString()})`}
                          </span>
                        </div>
                      )}

                      {estimatedTax > 0 && (
                        <p className="text-[10px] text-pink-600 bg-pink-50 rounded px-2 py-1 leading-snug">
                          ⚠️ {taxLabel} ~{formatPrice(estimatedTax, currency)} ({t('review.taxNotIncluded')})
                        </p>
                      )}
                    </div>

                    <div className="border-t border-border mt-4 pt-4">
                      {paymentDiscount > 0 && (
                        <div className="flex justify-between text-green-600 font-semibold">
                          <span>{t('review.paymentDiscount')}</span>
                          <span>-{formatPrice(paymentDiscount, currency)}</span>
                        </div>
                      )}

                      {/* Total sem método específico */}
                      {!isPix && (
                        <div className="flex justify-between font-black text-xl mb-3">
                          <span>{t('cart.total')}</span>
                          <span className="text-pink-600">{formatPrice(finalGrandTotal, currency)}</span>
                        </div>
                      )}

                      {/* Total geral (sempre visível abaixo do bloco PIX) */}
                      {isPix && (
                        <div className="flex justify-between font-black text-base text-muted-foreground mb-3">
                          <span>{t('review.totalGeneral')}</span>
                          <span className="text-pink-600 text-xl">{formatPrice(finalGrandTotal, currency)}</span>
                        </div>
                      )}

                      <Button
                        onClick={handleProceedToPayment}
                        disabled={orderCreating}
                        className="w-full btn-primary rounded-xl py-5 text-base font-bold"
                      >
                        <CheckCircle className="w-5 h-5 mr-2" />
                        {orderCreating ? t('review.creating') : t('review.confirmPay')}
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </Button>

                      {user && earnedPoints > 0 && (
                        <div className="flex justify-center gap-1 text-green-700 text-xs mt-3 bg-green-50 rounded-lg py-2">
                          <Sparkles className="w-3.5 h-3.5 mt-0.5" />
                          <span>+{earnedPoints} {t('review.pointsAfter')}{pointsMultiplier > 1 && <span className="ml-1 inline-block bg-green-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">x{pointsMultiplier}</span>}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selos de segurança compactos */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-green-700 print:hidden">
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>🔒</span><span className="font-semibold">{t('review.secHttps')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>✅</span><span className="font-semibold">{t('review.secGuaranteed')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>🛡️</span><span className="font-semibold">{t('review.secLgpd')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>📦</span><span className="font-semibold">{t('review.secTracking')}</span>
                    </div>
                  </div>

                </div>
              </div>{/* end COLUNA DIREITA */}

            </div>{/* end grid */}
          </div>{/* end max-w-7xl */}
        </div>
      </section>

      {/* Modal de Pagamento — aparece ANTES de salvar o pedido */}
      {paymentModal && pendingOrder && (() => {
        const pixPayload = paySettings.pixKey
          ? buildPixPayload({
              key: paySettings.pixKey,
              amount: Number(pendingOrder.total) || 0,
              receiverName: paySettings.pixReceiverName,
              city: paySettings.pixCity,
              txid: String(pendingOrder.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25),
            })
          : '';
        // Converte telefone doméstico (070-XXXX-XXXX) → formato internacional wa.me (81XXXXXXXXXX)
        const waPhone = paySettings.contactPhone
          ? paySettings.contactPhone.replace(/[-\s]/g, '').replace(/^0/, '81')
          : '';
        const waMessage = encodeURIComponent(`Olá! Acabei de fazer o pagamento do pedido ${pendingOrder.id} no valor de ${formatPrice(pendingOrder.total, pendingOrder.currency)}. Segue o comprovante:`);
        const whatsappLink = waPhone ? `https://wa.me/${waPhone}?text=${waMessage}` : '';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-card rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b">
                <h2 className="font-bold text-lg text-foreground">{t('review.payModalTitle')}</h2>
                <button onClick={() => setPaymentModal(false)} className="p-1 rounded-lg hover:bg-muted">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 text-center">
                <p className="text-sm text-muted-foreground">
                  {t('review.orderLabel')} <span className="font-mono font-bold text-foreground">{pendingOrder.id}</span> — {t('cart.total')}: <strong>{formatPrice(pendingOrder.total, pendingOrder.currency)}</strong>
                </p>

                {/* PIX */}
                {pendingOrder.paymentMethod === 'pix' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-pink-600 font-extrabold text-base">
                      <Smartphone className="w-5 h-5" /> {t('order.payViaPix')}
                    </div>
                    {pixPayload ? (
                      <>
                        <p className="text-sm text-gray-600">{t('order.pixPayPre')} <strong>{formatPrice(pendingOrder.total, pendingOrder.currency)}</strong> {t('review.pixScanCopy')}</p>
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 inline-block">
                          <QRCodeSVG value={pixPayload} size={180} includeMargin />
                        </div>
                        <div className="flex border border-gray-300 rounded-xl overflow-hidden bg-gray-50 max-w-sm mx-auto">
                          <input readOnly value={pixPayload} className="flex-1 px-3 py-2 text-xs font-mono text-gray-500 bg-transparent select-all outline-none" />
                          <button onClick={() => { navigator.clipboard.writeText(pixPayload); setPixCopied(true); setTimeout(() => setPixCopied(false), 2500); }}
                            className="bg-pink-500 hover:bg-pink-600 text-white px-4 flex items-center gap-1.5 text-xs font-bold transition-colors">
                            <Copy className="w-3.5 h-3.5" />{pixCopied ? t('order.copied') : t('order.copy')}
                          </button>
                        </div>
                        {whatsappLink && (
                          <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
                            <ExternalLink className="w-4 h-4" /> {t('order.sendReceipt')}
                          </a>
                        )}
                      </>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
                        <AlertCircle className="w-6 h-6 mx-auto mb-2 text-yellow-600" />
                        {t('review.pixKeyMissing')} {paySettings.contactPhone && <>{t('review.contactWa')} <strong>+{waPhone}</strong>.</>}
                      </div>
                    )}
                  </div>
                )}

                {/* Cartão de Crédito (Stripe) — pagamento confirmado automaticamente */}
                {pendingOrder.paymentMethod === 'card' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 text-indigo-600 font-extrabold text-base">
                      <CreditCard className="w-5 h-5" /> {t('review.payCard')}
                    </div>
                    <StripeCardForm
                      clientSecret={stripeClientSecret}
                      onSuccess={handleFinalizeOrder}
                    />
                  </div>
                )}

                {pendingOrder.paymentMethod !== 'card' && (
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">{t('review.afterPay')}</p>
                    <Button onClick={handleFinalizeOrder} className="w-full btn-primary py-4 text-base font-bold rounded-xl gap-2">
                      <CheckCircle className="w-5 h-5" />
                      {t('review.paid')}
                    </Button>
                    <button onClick={() => setPaymentModal(false)} className="text-xs text-muted-foreground hover:underline">
                      {t('review.backReview')}
                    </button>
                  </div>
                )}
                {pendingOrder.paymentMethod === 'card' && (
                  <button onClick={() => setPaymentModal(false)} className="text-xs text-muted-foreground hover:underline block mx-auto pt-1">
                    {t('review.backReview')}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
};

export default OrderReview;
