import { safeStorage } from '@/utils/storage';
import React, { useState, useEffect, useMemo } from 'react';
import { emailServiceSimple } from '@/services/emailServiceSimple';
import { useNavigate, useLocation } from 'react-router-dom';
import { Package, ArrowRight, Printer, CreditCard, Landmark, Smartphone, MapPin, User, Phone, Mail, CheckCircle, Tag, Copy, AlertCircle, ExternalLink, Wallet as WalletIcon, X } from 'lucide-react';
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
import { effectiveYen, roundYen } from '@/utils/pricing';
import { convertYen as fxConvert, yenFromConverted } from '@/services/fxService';
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
import { Wallet } from 'lucide-react';
import { referralService } from '@/services/referralService';
import { calcBrazilTax, calcImportTax } from '@/utils/taxRules';
import { promoCampaignService } from '@/services/promoCampaignService';
import { thermalPrintService } from '@/services/thermalPrintService';
import StripeCardForm from '@/components/checkout/StripeCardForm';
import { prepareCheckout, type AuthoritativeCheckoutOrder, type CheckoutPaymentMethod } from '@/services/checkoutService';
import { getCountryConfig } from '@/data/worldCountries';
import { db } from '@/config/firebase';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


const OrderReview: React.FC = () => {
  const { items, clearCart } = useCart();
  const { refresh: refreshProducts } = useProducts();
  const { consumeCouponByCode, user, addPoints, addOrder, addCoupon, orders } = useUser();
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
  const [couponDiscount, setCouponDiscount] = useState<number>(location.state?.couponDiscount || 0);
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
    return formData?.country === 'Japão' ? 'paypay' : 'wise';
  });
  const WISE_INVITE_LINK = 'https://wise.com/invite/ahpc/juniorcelsotadaos';
  const [paySettings, setPaySettings] = useState<import('@/services/paymentSettingsService').PaymentSettings>({
    wiseLink: '', wiseEnabled: false,
    pixKey: '', pixReceiverName: 'NikkeyBox', pixCity: 'Sao Paulo',
    pixEnabled: false, cardEnabled: true,
    yuchoKigo: '', yuchoNumber: '', yuchoName: '', contactPhone: '',
  });

  // O pedido é criado no servidor antes de abrir o modal. Nenhuma mutação
  // financeira depende do navegador.
  const [paymentModal, setPaymentModal] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<AuthoritativeCheckoutOrder | null>(null);
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const [orderCreating, setOrderCreating] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  useEffect(() => {
    paymentSettingsService.get().then((s) => {
      setPaySettings(s);
      // Se o método pré-selecionado (Wise, por padrão) estiver desativado,
      // troca automaticamente para o primeiro disponível.
      setPaymentMethod((current) => {
        if (formData?.country === 'Japão') return current;
        const enabledByMethod: Record<string, boolean> = { wise: s.wiseEnabled, pix: s.pixEnabled, card: s.cardEnabled };
        if (enabledByMethod[current]) return current;
        return (['wise', 'pix', 'card'] as const).find((m) => enabledByMethod[m]) || current;
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

  // Base Total Price (subtotal before discounts/taxes) in target currency — excludes free gifts
  const baseTotalPrice = items.reduce(
    (sum, item) => item.freeGift ? sum : sum + convertYen(effectiveYen(item.product, item.size)) * item.quantity, 0
  );

  // Gasto dos últimos 3 meses-calendário, para o multiplicador de pontos.
  // A conta mora em `utils/loyaltySpend` porque o perfil mostra o MESMO nível.

  const pointsMultiplier = pointsMultiplierForSpend(recentSpendYen);

  // Pontos pagam só mercadoria. Resgate parcial convive com desconto na taxa;
  // apenas quando os pontos zeram toda a mercadoria a taxa PS volta ao valor
  // cheio, exatamente como a cotação autoritativa do servidor.
  const availablePoints = user?.points || 0;
  const couponDiscountYen = couponDiscount > 0 ? Math.floor(yenFromConverted(couponDiscount, currency)) : 0;
  const maxRedeemable = Math.min(
    availablePoints,
    Math.max(0, Math.floor((productSubtotalYen - couponDiscountYen) / POINTS.yenPerPoint)),
  );
  const redeemPoints = Math.max(0, Math.min(pointsToUse, maxRedeemable));
  const netProductsAfterCouponAndPoints = productSubtotalYen - couponDiscountYen - redeemPoints;
  const pointsCoverAllProducts = productSubtotalYen > 0 && redeemPoints > 0 && netProductsAfterCouponAndPoints <= 0;
  const pointsDiscount = convertYen(redeemPoints * POINTS.yenPerPoint); // desconto na moeda exibida
  // Mesma função que `api/_lib/commerce.js` usa para creditar — o número que
  // aparece aqui é exatamente o que vai cair na conta do cliente, incluindo
  // o multiplicador de pontos pelo nível do cliente.
  const earnedPoints = earnedPointsForOrder(productSubtotalYen, redeemPoints * POINTS.yenPerPoint, pointsMultiplier);

  const isPix = paymentMethod === 'pix';
  const subtotalWithCoupon = Math.max(0, baseTotalPrice - couponDiscount - pointsDiscount);
  // Sem desconto por método de pagamento.
  const pixDiscount = 0;
  const priceAfterPix = subtotalWithCoupon;
  
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
    taxLabel = 'Impostos Estimados (Brasil)';
  } else {
    const r = calcImportTax(priceAfterPix, formData.country, formData.prefecture);
    estimatedTax = r.tax;
    taxLabel = r.label;
  }
  
  const taxAmount = estimatedTax; // Saved in mockOrder for administrative visibility
  
  const rawShippingCost = appliedCoupon?.freeShipping ? 0 : shipping.cost;
  const shippingDiscountDisplay = convertYen(shippingDiscountYen);
  const finalShippingCost = Math.max(0, rawShippingCost - shippingDiscountDisplay);
  const effectivePsFeeDiscountYen = pointsCoverAllProducts ? 0 : psFeeDiscountYen;
  const psFeeFinalYen = Math.max(0, psFeeYen - effectivePsFeeDiscountYen);
  const psFeeDisplay = convertYenExact(psFeeFinalYen);
  // Grand Total only includes products + shipping + PS fee (NO TAXES ADDED!)
  const grandTotal = priceAfterPix + finalShippingCost + psFeeDisplay;

  // PIX: IOF 3,5% sobre o total + taxa bancária de remessa fixa R$32
  const PIX_BANK_FEE = 32; // taxa fixa do banco para remessa internacional em BRL
  const pixIofFee = isPix ? Math.round(grandTotal * 0.035) : 0;
  const pixBankFee = isPix ? PIX_BANK_FEE : 0;
  const pixTotalFees = pixIofFee + pixBankFee;
  const finalGrandTotal = grandTotal + pixTotalFees;

  // Total em ¥ para exibir no badge da Wise (sem taxas PIX)
  const grandTotalYen = currency === 'JPY' ? grandTotal : roundYen(yenFromConverted(grandTotal, currency));

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
          toast({ title: `Cupom ${code} aplicado!`, description: `-${formatPrice(disc, currency)}` });
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
          description: gc.description || `Cupom ${gc.code}`,
          discount: gc.type === 'percent' ? (gc.discountPercent || gc.discount || 0) : (gc.discount || 0),
          discountType: gc.type === 'fixed' ? 'fixed' : 'percentage',
          expiresAt: gc.expiryDate,
          isUsed: false,
          freeShipping: gc.freeShipping,
        };
        setCouponDiscount(disc);
        setAppliedCoupon(couponObj);
        setCouponInput('');
        toast({ title: `Cupom ${code} aplicado!`, description: `-${formatPrice(disc, currency)}` });
        return;
      }
      setCouponError('Cupom inválido ou expirado.');
    } catch {
      setCouponError('Erro ao validar cupom. Tente novamente.');
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
      toast({
        title: 'Não foi possível criar o pedido',
        description: waiverInvalid
          ? 'A isenção da taxa expirou ou já foi usada. O total foi atualizado; tente novamente.'
          : codigo || 'Revise os itens e tente novamente.',
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
    if (pendingOrder.paymentMethod !== 'card') {
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
              Revisar Pedido
            </h1>
            <p className="text-muted-foreground text-lg">
              {isJapan 
                ? 'Verifique os dados de entrega doméstica antes de confirmar'
                : 'Verifique todos os dados da importação aérea antes de finalizar'
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
                Imprimir Recibo
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
                  {isJapan ? 'Produtos Selecionados (Entrega no Japão)' : 'Produtos Selecionados (Centro de Hiroshima)'}
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
                          Opção: {item.freeGift ? '🎁 Presente da promoção' : (item.variantLabel || (item.size === 'small' ? 'Pequeno' : 'Grande'))} • Quantidade: {item.quantity}x
                        </p>
                        {!item.freeGift && (
                          <p className="text-xs text-gray-400">
                            Preço unitário: {formatPrice(displayUnitPrice, currency)}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {item.freeGift ? (
                          <p className="font-bold text-base text-green-600">GRÁTIS 🎁</p>
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
                    <span>Subtotal</span>
                    <span>{formatPrice(baseTotalPrice, currency)}</span>
                  </div>

                  {/* Coupon input */}
                  {!appliedCoupon && (
                    <div className="bg-muted/40 border border-dashed border-border rounded-lg p-3 print:hidden">
                      <div className="flex items-center gap-2 mb-2">
                        <Tag className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">Tem um cupom?</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponInput}
                          onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                          onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                          placeholder="CÓDIGO DO CUPOM"
                          className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-mono uppercase"
                        />
                        <Button size="sm" variant="outline" onClick={handleApplyCoupon} disabled={couponLoading || !couponInput.trim()}>
                          {couponLoading ? '...' : 'Aplicar'}
                        </Button>
                      </div>
                      {couponError && <p className="text-xs text-red-500 mt-1">{couponError}</p>}
                    </div>
                  )}

                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-green-600 font-bold bg-green-50/50 p-2 rounded border border-dashed border-green-200">
                      <span className="flex items-center gap-2">
                        Desconto do Cupom {appliedCoupon ? `(${appliedCoupon.code})` : ''}
                        <button type="button" onClick={() => { setCouponDiscount(0); setAppliedCoupon(null); }} className="text-[10px] text-red-400 hover:text-red-600 underline font-normal print:hidden">remover</button>
                      </span>
                      <span>-{formatPrice(couponDiscount, currency)}</span>
                    </div>
                  )}

                  {/* Resgate de pontos de fidelidade */}
                  {user && availablePoints > 0 && (
                    <div className="bg-purple-50 dark:bg-purple-950/20 border border-dashed border-purple-300 rounded-lg p-3 print:hidden">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4" /> Usar pontos ({availablePoints} disponíveis)
                        </span>
                        <span className="text-[11px] text-purple-700">1 ponto = ¥1</span>
                      </div>
                      <>
                        {pointsCoverAllProducts && psFeeDiscountYen > 0 && (
                          <p className="text-xs text-orange-700 dark:text-orange-400 leading-snug mb-2">
                            Como os pontos cobrem todos os produtos, o desconto ou a isenção da taxa do
                            Personal Shopper será desconsiderado — a taxa será cobrada integralmente.
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
                            className="text-xs font-semibold text-purple-700 hover:underline">Usar máx. ({maxRedeemable})</button>
                          {redeemPoints > 0 && (
                            <button type="button" onClick={() => setPointsToUse(0)}
                              className="text-xs text-muted-foreground hover:underline ml-auto">limpar</button>
                          )}
                        </div>
                        <p className="text-[11px] text-purple-700 mt-1.5">
                          Vale só para os produtos — frete e taxa do Personal Shopper não podem ser pagos com pontos.
                        </p>
                      </>
                    </div>
                  )}

                  {pointsDiscount > 0 && (
                    <div className="flex justify-between text-purple-700 font-bold bg-purple-50/60 p-2 rounded border border-dashed border-purple-200">
                      <span>Desconto em pontos ({redeemPoints} pts)</span>
                      <span>-{formatPrice(pointsDiscount, currency)}</span>
                    </div>
                  )}

                  {pixDiscount > 0 && (
                    <div className="flex justify-between text-pink-600 font-bold bg-pink-50 p-2 rounded border border-dashed border-pink-200">
                      <span>Desconto Extra de 5% (Pagamento via PIX)</span>
                      <span>-{formatPrice(pixDiscount, 'BRL')}</span>
                    </div>
                  )}

                  {user && earnedPoints > 0 && (
                    <div className="flex justify-between text-green-700 text-xs bg-green-50/60 p-2 rounded">
                      <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Você ganhará nesta compra</span>
                      <span className="font-bold">+{earnedPoints} pts{pointsMultiplier > 1 && <span className="ml-1 inline-block bg-green-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">x{pointsMultiplier}</span>}</span>
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
                        ⚠️ <strong>Nota:</strong> Este imposto é aproximado e poderá ser cobrado pela alfândega local na chegada do pacote no país de destino. Ele <strong>NÃO</strong> foi adicionado ao total geral cobrado no site.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-between text-muted-foreground">
                    <span>{isJapan ? 'Frete Local' : 'Frete Aéreo'} ({shipping.carrier})</span>
                    <span>{finalShippingCost === 0 ? 'Grátis' : formatPrice(finalShippingCost, currency)}</span>
                  </div>

                  <div className="text-[10px] text-gray-400 text-right">
                    {isJapan ? 'Envio doméstico seguro de Hiroshima Prefecture.' : `Envio internacional de Hiroshima para ${formData.country}.`} Entrega estimada: {shipping.estimatedDays} dias úteis
                  </div>

                  {psFeeYen > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxa Personal Shopper</span>
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

                  {isPix && (
                    <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 space-y-1.5 mt-1">
                      <p className="text-[10px] text-pink-600 font-semibold mb-1">
                        Taxas aplicadas por pagamento via PIX (remessa internacional)
                      </p>
                      <div className="flex justify-between text-xs text-gray-500 border-b border-pink-100 pb-1.5">
                        <span>Subtotal (antes das taxas PIX)</span>
                        <span>{formatPrice(grandTotal, currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-pink-700">
                        <span>+ IOF (3,5% sobre o subtotal)</span>
                        <span>+ {formatPrice(pixIofFee, currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-pink-700">
                        <span>+ Taxa bancária de remessa (fixa)</span>
                        <span>+ R$ 32</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold text-orange-900 bg-pink-100 rounded px-1.5 py-1 mt-0.5">
                        <span>= Total com taxas PIX</span>
                        <span>{formatPrice(finalGrandTotal, currency)}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-3 border-t border-border font-black text-lg">
                    <span>Total Geral</span>
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
                  {isJapan ? 'Informações do Cliente' : 'Informações de Faturamento e Aduana'}
                </h2>
              </div>

              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground font-semibold">Nome Completo</Label>
                  <p className="font-bold text-gray-800 text-base">{formData.name}</p>
                </div>

                 {!isJapan && (
                   <div>
                     <Label className="text-muted-foreground font-semibold">CPF (Desembaraço Aduaneiro)</Label>
                     <p className="font-bold text-pink-600 text-base">{formData.cpf}</p>
                   </div>
                 )}

                <div>
                  <Label className="text-muted-foreground font-semibold">Telefone</Label>
                  <p className="font-medium text-gray-800">{formData.phone}</p>
                </div>

                <div>
                  <Label className="text-muted-foreground font-semibold">Email de Contato</Label>
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
                    Endereço de Entrega ({
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
                    <Label className="text-muted-foreground">Código Postal / CEP</Label>
                    <p className="font-bold text-gray-800">〒 {formData.postalCode}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{isJapan ? 'Província' : 'Estado / UF'}</Label>
                    <p className="font-medium text-gray-800">{formData.prefecture}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Cidade</Label>
                    <p className="font-medium text-gray-800">{formData.city}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Rua e Número</Label>
                  <p className="font-medium text-gray-800">{formData.address}</p>
                </div>
                {formData.building && (
                  <div>
                    <Label className="text-muted-foreground">Complemento / Edifício</Label>
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
                  Selecione o Método de Pagamento
                </h2>
              </div>

              <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                <div className="space-y-4">
                  {isJapan ? (
                    <>
                      {/* PayPay Option for Japan */}
                      <div className={cn(
                        "flex items-start space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer",
                        paymentMethod === 'paypay' ? "border-pink-500 bg-pink-50/50" : "border-border hover:border-gray-300"
                      )}>
                        <RadioGroupItem value="paypay" id="paypay" className="mt-1" />
                        <Label htmlFor="paypay" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl">📱</span>
                            <span className="font-bold text-base text-gray-800">PayPay</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Pague de forma rápida e instantânea usando o aplicativo PayPay via QR Code na próxima tela.
                          </p>
                        </Label>
                      </div>

                      {/* Bank Transfer Option for Japan */}
                      <div className={cn(
                        "flex items-start space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer",
                        paymentMethod === 'yucho' ? "border-pink-500 bg-pink-50/50" : "border-border hover:border-gray-300"
                      )}>
                        <RadioGroupItem value="yucho" id="yucho" className="mt-1" />
                        <Label htmlFor="yucho" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 mb-1">
                            <Landmark className="w-5 h-5 text-emerald-600" />
                            <span className="font-bold text-base text-gray-800">Depósito Bancário (Yucho Bank / ゆうちょ銀行)</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Faça a transferência para nossa conta no Yucho Bank (Paula Shiokawa). As instruções estarão na próxima tela.
                          </p>
                        </Label>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Wise Option (transferência internacional) — principal */}
                      {paySettings.wiseEnabled ? (
                      <div className={cn(
                        "flex items-start space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer",
                        paymentMethod === 'wise' ? "border-emerald-500 bg-emerald-50/50" : "border-border hover:border-gray-300"
                      )}>
                        <RadioGroupItem value="wise" id="wise" className="mt-1" />
                        <Label htmlFor="wise" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 mb-1">
                            <Wallet className="w-5 h-5 text-emerald-600" />
                            <span className="font-bold text-base text-gray-800">Wise — pague com PIX</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Você paga em <strong>reais, por PIX</strong>, dentro da Wise. Ela converte e envia
                            os ienes para a loja. O link de pagamento aparece na próxima tela.
                          </p>
                          <div className="mt-2 flex flex-col gap-1">
                            <div className="flex items-start gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
                              <span className="mt-0.5">💱</span>
                              <span>
                                No campo <strong>Valor</strong> do Wise, insira{' '}
                                <strong className="text-emerald-900">¥ {grandTotalYen.toLocaleString()}</strong>{' '}
                                (ienes). A Wise converte automaticamente para a sua moeda.
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 w-fit">
                              <span>ℹ️</span>
                              <span>Taxa Wise variável (~4%) — <strong>sem IOF</strong></span>
                            </div>
                          </div>
                          {/* Aviso: não tem Wise? Cadastre-se */}
                          {paymentMethod === 'wise' && (
                            <a
                              href={WISE_INVITE_LINK}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg px-3 py-2 transition-colors"
                            >
                              <span>🌍 Não tem Wise? Cadastre-se aqui — é <strong>rápido e fácil</strong>!</span>
                              <span className="shrink-0">↗</span>
                            </a>
                          )}
                        </Label>
                      </div>
                      ) : (
                        <div className="flex items-start space-x-3 p-4 rounded-xl border-2 border-border opacity-60 cursor-not-allowed">
                          <RadioGroupItem value="wise" id="wise" className="mt-1" disabled />
                          <Label htmlFor="wise" className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Wallet className="w-5 h-5 text-gray-400" />
                              <span className="font-bold text-base text-gray-600">Wise (Transferência Internacional)</span>
                              <span className="text-[10px] bg-gray-400 text-white font-extrabold px-2 py-0.5 rounded-full uppercase">Em manutenção</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Pagamento via Wise em manutenção. Volta em breve!
                            </p>
                          </Label>
                        </div>
                      )}

                      {/* PIX direto. Fica DESLIGADO no painel: a remessa para o Japão
                          come IOF mais taxa de conversão, e o mesmo PIX pago dentro da
                          Wise não paga IOF — o caminho existe, só não é este.

                          Quando desligado a opção não é desenhada. Um botão cinza
                          "em manutenção" num site novo o cliente lê como site quebrado,
                          e ele não vai deduzir sozinho que o PIX está logo acima, na Wise.
                          O código fica: religar é trocar `pixEnabled` no painel.

                          Não precisa de guarda contra ficar selecionado e invisível: o
                          efeito da linha ~97 já troca para o primeiro método ativo. */}
                      {paySettings.pixEnabled && (
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
                            Pague via PIX com QR Code ou Copia e Cola — mostraremos na próxima tela.
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
                            <span className="font-bold text-base text-gray-800">Cartão de Crédito</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Pague com cartão de crédito de forma segura via Stripe. Confirmação instantânea.
                          </p>
                        </Label>
                      </div>
                      ) : (
                        <div className="flex items-start space-x-3 p-4 rounded-xl border-2 border-border opacity-60 cursor-not-allowed">
                          <RadioGroupItem value="card" id="card" className="mt-1" disabled />
                          <Label htmlFor="card" className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <CreditCard className="w-5 h-5 text-gray-400" />
                              <span className="font-bold text-base text-gray-600">Cartão de Crédito</span>
                              <span className="text-[10px] bg-gray-400 text-white font-extrabold px-2 py-0.5 rounded-full uppercase">Em manutenção</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Pagamento com cartão em manutenção. Volta em breve!
                            </p>
                          </Label>
                        </div>
                      )}
                    </>
                  )}
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
                ← Voltar e Editar Dados
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
                      Resumo do Pedido
                    </h3>

                    <div className="space-y-2 text-sm">
                      {/* Itens */}
                      <div className="flex justify-between text-muted-foreground">
                        <span>Itens ({items.filter(i => !i.freeGift).length}x)</span>
                        <span>{formatPrice(baseTotalPrice, currency)}</span>
                      </div>

                      {couponDiscount > 0 && (
                        <div className="flex justify-between text-green-600 font-semibold">
                          <span>Cupom ({appliedCoupon?.code})</span>
                          <span>−{formatPrice(couponDiscount, currency)}</span>
                        </div>
                      )}

                      {pointsDiscount > 0 && (
                        <div className="flex justify-between text-purple-600 font-semibold">
                          <span>Pontos ({redeemPoints} pts)</span>
                          <span>−{formatPrice(pointsDiscount, currency)}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-muted-foreground">
                        <span>Frete</span>
                        <span>{finalShippingCost === 0 ? 'Grátis' : formatPrice(finalShippingCost, currency)}</span>
                      </div>

                      {psFeeYen > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Taxa PS</span>
                          <span className={effectivePsFeeDiscountYen > 0 ? 'text-green-600 font-semibold' : ''}>
                            {currency === 'JPY' ? `¥ ${psFeeFinalYen.toLocaleString()}` : formatPrice(psFeeDisplay, currency, true)}
                          </span>
                        </div>
                      )}

                      {estimatedTax > 0 && (
                        <p className="text-[10px] text-pink-600 bg-pink-50 rounded px-2 py-1 leading-snug">
                          ⚠️ {taxLabel} ~{formatPrice(estimatedTax, currency)} (cobrado pela alfândega, NÃO incluso)
                        </p>
                      )}
                    </div>

                    <div className="border-t border-border mt-4 pt-4">
                      {/* PIX block */}
                      {isPix && (
                        <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 mb-3 space-y-1.5">
                          <p className="text-[10px] font-bold text-pink-700 uppercase tracking-wide">Pagamento via PIX</p>
                          <div className="flex justify-between text-xs text-pink-700">
                            <span>Subtotal</span>
                            <span>{formatPrice(grandTotal, currency)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-pink-700">
                            <span>+ IOF (3,5%)</span>
                            <span>+ {formatPrice(pixIofFee, currency)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-pink-700">
                            <span>+ Taxa bancária</span>
                            <span>+ R$ 32</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold text-orange-900 border-t border-pink-200 pt-1 mt-1">
                            <span>Total PIX</span>
                            <span className="text-base">{formatPrice(finalGrandTotal, currency)}</span>
                          </div>
                          <p className="text-[10px] text-amber-600 mt-1">⏱ Remessa em até 3 dias úteis após confirmação</p>
                        </div>
                      )}

                      {/* Wise block */}
                      {paymentMethod === 'wise' && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3 space-y-1.5">
                          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Pagamento via Wise</p>
                          <div className="flex justify-between text-xs text-emerald-700">
                            <span>Total</span>
                            <span className="font-bold">{formatPrice(grandTotal, currency)}</span>
                          </div>
                          <div className="bg-emerald-100 rounded-lg p-2 text-center mt-1">
                            <p className="text-[10px] text-emerald-700 mb-0.5">No campo <strong>Valor</strong> do Wise, insira:</p>
                            <p className="text-xl font-black text-emerald-900">¥ {grandTotalYen.toLocaleString()}</p>
                            <p className="text-[10px] text-emerald-600">A Wise converte automaticamente</p>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1">Taxa Wise ~4% • Sem IOF</p>
                        </div>
                      )}

                      {/* Total sem método específico */}
                      {!isPix && paymentMethod !== 'wise' && (
                        <div className="flex justify-between font-black text-xl mb-3">
                          <span>Total</span>
                          <span className="text-pink-600">{formatPrice(finalGrandTotal, currency)}</span>
                        </div>
                      )}

                      {/* Total geral (sempre visível abaixo dos blocos PIX/Wise) */}
                      {(isPix || paymentMethod === 'wise') && (
                        <div className="flex justify-between font-black text-base text-muted-foreground mb-3">
                          <span>Total Geral</span>
                          <span className="text-pink-600 text-xl">{formatPrice(finalGrandTotal, currency)}</span>
                        </div>
                      )}

                      <Button
                        onClick={handleProceedToPayment}
                        disabled={orderCreating}
                        className="w-full btn-primary rounded-xl py-5 text-base font-bold"
                      >
                        <CheckCircle className="w-5 h-5 mr-2" />
                        {orderCreating ? 'Criando pedido seguro...' : 'Confirmar e Pagar'}
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </Button>

                      {user && earnedPoints > 0 && (
                        <div className="flex justify-center gap-1 text-green-700 text-xs mt-3 bg-green-50 rounded-lg py-2">
                          <Sparkles className="w-3.5 h-3.5 mt-0.5" />
                          <span>+{earnedPoints} pontos após a compra{pointsMultiplier > 1 && <span className="ml-1 inline-block bg-green-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">x{pointsMultiplier}</span>}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selos de segurança compactos */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-green-700 print:hidden">
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>🔒</span><span className="font-semibold">HTTPS Seguro</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>✅</span><span className="font-semibold">100% Garantido</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>🛡️</span><span className="font-semibold">LGPD</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>📦</span><span className="font-semibold">Rastreamento</span>
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
                <h2 className="font-bold text-lg text-foreground">Realizar Pagamento</h2>
                <button onClick={() => setPaymentModal(false)} className="p-1 rounded-lg hover:bg-muted">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 text-center">
                <p className="text-sm text-muted-foreground">
                  Pedido <span className="font-mono font-bold text-foreground">{pendingOrder.id}</span> — Total: <strong>{formatPrice(pendingOrder.total, pendingOrder.currency)}</strong>
                </p>

                {/* PIX */}
                {pendingOrder.paymentMethod === 'pix' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-pink-600 font-extrabold text-base">
                      <Smartphone className="w-5 h-5" /> PAGAMENTO VIA PIX
                    </div>
                    {pixPayload ? (
                      <>
                        <p className="text-sm text-gray-600">Pague <strong>{formatPrice(pendingOrder.total, pendingOrder.currency)}</strong> escaneando o QR Code ou copiando a chave abaixo.</p>
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 inline-block">
                          <QRCodeSVG value={pixPayload} size={180} includeMargin />
                        </div>
                        <div className="flex border border-gray-300 rounded-xl overflow-hidden bg-gray-50 max-w-sm mx-auto">
                          <input readOnly value={pixPayload} className="flex-1 px-3 py-2 text-xs font-mono text-gray-500 bg-transparent select-all outline-none" />
                          <button onClick={() => { navigator.clipboard.writeText(pixPayload); setPixCopied(true); setTimeout(() => setPixCopied(false), 2500); }}
                            className="bg-pink-500 hover:bg-pink-600 text-white px-4 flex items-center gap-1.5 text-xs font-bold transition-colors">
                            <Copy className="w-3.5 h-3.5" />{pixCopied ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                        {whatsappLink && (
                          <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
                            <ExternalLink className="w-4 h-4" /> Enviar comprovante no WhatsApp
                          </a>
                        )}
                      </>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
                        <AlertCircle className="w-6 h-6 mx-auto mb-2 text-yellow-600" />
                        Chave PIX não configurada. {paySettings.contactPhone && <>Entre em contato pelo WhatsApp <strong>+{waPhone}</strong>.</>}
                      </div>
                    )}
                  </div>
                )}

                {/* PayPay */}
                {pendingOrder.paymentMethod === 'paypay' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-pink-600 font-extrabold text-base">
                      <Smartphone className="w-5 h-5 animate-pulse" /> PAGAMENTO VIA PAYPAY
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 inline-block">
                      <img src="/products/paypay-qr.png" alt="PayPay QR Code"
                        className="w-52 h-auto rounded-xl border border-gray-200 mx-auto"
                        onError={(e) => { e.currentTarget.src = 'https://placehold.co/200x200/red/white?text=PayPay+QR'; }} />
                    </div>
                    <div className="bg-gray-100 p-3 rounded-xl text-xs font-mono text-left max-w-xs mx-auto space-y-1">
                      <p><strong>Enviar para:</strong> NikkeyBox</p>
                      {paySettings.contactPhone && <p><strong>Telefone:</strong> {paySettings.contactPhone}</p>}
                      <p><strong>Valor:</strong> {formatPrice(pendingOrder.total, 'JPY')}</p>
                    </div>
                    {paySettings.contactPhone && (
                      <p className="text-xs text-muted-foreground">Após pagar, envie o comprovante no WhatsApp: <strong>{paySettings.contactPhone}</strong></p>
                    )}
                  </div>
                )}

                {/* Yucho */}
                {pendingOrder.paymentMethod === 'yucho' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 text-pink-600 font-extrabold text-base">
                      <Landmark className="w-5 h-5" /> DEPÓSITO BANCÁRIO (YUCHO)
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 font-mono text-xs text-left space-y-2 max-w-xs mx-auto">
                      <div className="flex justify-between"><span className="text-gray-500">Banco:</span><span className="font-bold">ゆうちょ銀行</span></div>
                      {paySettings.yuchoKigo && <div className="flex justify-between"><span className="text-gray-500">記号:</span><span className="font-bold">{paySettings.yuchoKigo}</span></div>}
                      {paySettings.yuchoNumber && <div className="flex justify-between"><span className="text-gray-500">番号:</span><span className="font-bold">{paySettings.yuchoNumber}</span></div>}
                      {paySettings.yuchoName && <div className="flex justify-between"><span className="text-gray-500">Nome:</span><span className="font-bold">{paySettings.yuchoName}</span></div>}
                    </div>
                    {paySettings.contactPhone && (
                      <p className="text-xs text-muted-foreground">Após o depósito, envie comprovante no WhatsApp: <strong>{paySettings.contactPhone}</strong></p>
                    )}
                  </div>
                )}

                {/* Wise */}
                {pendingOrder.paymentMethod === 'wise' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 text-emerald-600 font-extrabold text-base">
                      <WalletIcon className="w-5 h-5" /> PAGAMENTO VIA WISE
                    </div>
                    <p className="text-sm text-muted-foreground">Pague <strong>{formatPrice(pendingOrder.total, pendingOrder.currency)}</strong> pelo Wise com câmbio justo.</p>
                    {paySettings.wiseLink && (
                      <a href={paySettings.wiseLink.startsWith('http') ? paySettings.wiseLink : `https://wise.com/pay/${paySettings.wiseLink.replace(/^@/, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl transition-colors">
                        <ExternalLink className="w-4 h-4" /> Pagar pelo Wise
                      </a>
                    )}
                    <a href={WISE_INVITE_LINK} target="_blank" rel="noopener noreferrer"
                      className="block text-xs font-semibold text-emerald-700 hover:underline mt-1">
                      🌍 Não tem Wise? Cadastre-se aqui — é rápido e fácil ↗
                    </a>
                  </div>
                )}

                {/* Cartão de Crédito (Stripe) — pagamento confirmado automaticamente */}
                {pendingOrder.paymentMethod === 'card' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 text-indigo-600 font-extrabold text-base">
                      <CreditCard className="w-5 h-5" /> PAGAMENTO COM CARTÃO
                    </div>
                    <StripeCardForm
                      clientSecret={stripeClientSecret}
                      onSuccess={handleFinalizeOrder}
                    />
                  </div>
                )}

                {pendingOrder.paymentMethod !== 'card' && (
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">Após realizar o pagamento, clique no botão abaixo para registrar seu pedido.</p>
                    <Button onClick={handleFinalizeOrder} className="w-full btn-primary py-4 text-base font-bold rounded-xl gap-2">
                      <CheckCircle className="w-5 h-5" />
                      Já realizei o pagamento — Confirmar Pedido
                    </Button>
                    <button onClick={() => setPaymentModal(false)} className="text-xs text-muted-foreground hover:underline">
                      Voltar e revisar o pedido
                    </button>
                  </div>
                )}
                {pendingOrder.paymentMethod === 'card' && (
                  <button onClick={() => setPaymentModal(false)} className="text-xs text-muted-foreground hover:underline block mx-auto pt-1">
                    Voltar e revisar o pedido
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
