import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Package, ArrowRight, MapPin, User, Phone, Mail, Tag, CreditCard, Sparkles, Handshake, X, CheckCircle2, AlertCircle, Hourglass } from 'lucide-react';
import { negotiationService } from '@/services/negotiationService';
import type { Negotiation } from '@/types/negotiation';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import ShippingCalculator from '@/components/shipping/ShippingCalculator';
import CouponSelector from '@/components/checkout/CouponSelector';
import { computeCouponDiscount } from '@/utils/couponDiscount';
import { prefectures } from '@/data/prefectures';
import { japanPrefectures } from '@/data/japanPrefectures';
import { europePrefectures } from '@/data/europePrefectures';
import { usStates } from '@/data/usStates';
import { getCountryConfig, WORLD_COUNTRIES } from '@/data/worldCountries';
import { Coupon } from '@/context/UserContext';
import { useToast } from '@/hooks/use-toast';
import { usePostalCodeLookup } from '@/hooks/usePostalCodeLookup';
import { useLanguage, CountryType } from '@/context/LanguageContext';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { effectiveYen } from '@/utils/pricing';
import { convertYen as fxConvert, yenFromConverted, getRates, getRateSource, loadFxRates } from '@/services/fxService';
import {
  clientCheckoutTotals,
  checkoutLineFromItem,
  couponYenFor,
  PS_FEE_PER_UNIT_YEN,
  PS_FEE_AUTO_DISCOUNT_PER_UNIT_YEN,
  type CheckoutCoupon,
} from '@/utils/checkoutTotals';
import { POINTS } from '@/services/pointsService';
import { safeStorage } from '@/utils/storage';
import { checkoutPointsCoverage, psFeeWaiver, PS_FEE_WAIVER_EVENT } from '@/utils/psFeeWaiver';
import { COUPONS_ENABLED } from '@/config/featureFlags';
import { productEnglishName } from '@/utils/productName';
import { isValidEmail, isValidCPF, isValidPhone, isNonEmpty, maskPhone, runValidations, FieldErrors } from '@/utils/validation';
import { calcImportTax } from '@/utils/taxRules';
import { trackBeginCheckout } from '@/lib/analytics';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


const Checkout: React.FC = () => {
  const { items, totalPrice } = useCart();
  const hasTrackedBeginCheckout = useRef(false);

  // Dispara begin_checkout (GA4 + Meta Pixel) uma única vez ao montar a página,
  // apenas se o carrinho não estiver vazio.
  useEffect(() => {
    if (hasTrackedBeginCheckout.current || items.length === 0) return;
    hasTrackedBeginCheckout.current = true;
    trackBeginCheckout(
      'JPY',
      totalPrice,
      items.map((i) => ({
        item_id: i.product.id,
        item_name: i.product.name,
        quantity: i.quantity,
        item_category: i.product.category,
      })),
    );
  }, [items, totalPrice]);
  const { user, isAuthenticated, authReady } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { lookupAddress: lookupJapaneseAddress } = usePostalCodeLookup();
  const { selectedCountry, setSelectedCountry, t } = useLanguage();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cpf: '',
    postalCode: '',
    prefecture: '', // UF or Province
    city: '',
    address: '',
    building: '',
    country: selectedCountry,
  });

  // Calculate base total price dynamically in correct currency
  const isEuro = ['Portugal', 'França', 'Itália', 'Espanha'].includes(formData.country);
  const isUsa = formData.country === 'Estados Unidos';
  const currency = getCurrencyByCountry(formData.country);

  const baseTotalPrice = items.reduce(
    (sum, item) => item.freeGift ? sum : sum + fxConvert(effectiveYen(item.product, item.size), currency) * item.quantity, 0
  );
  // Cupom não se aplica a itens com preço promocional
  const regularSubtotalForCoupon = items.reduce(
    (sum, item) => (!item.freeGift && !item.product.id.endsWith('_promo'))
      ? sum + fxConvert(effectiveYen(item.product, item.size), currency) * item.quantity
      : sum, 0
  );

  const [selectedShipping, setSelectedShipping] = useState<{
    carrier: string;
    cost: number;
    costYen: number;
    estimatedDays: string;
  } | null>(null);

  const [deliveryTime, setDeliveryTime] = useState<string>('');

  // Coupon state
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [, setCouponDiscount] = useState(0);

  // Points redemption
  const availablePoints = user?.points || 0;
  const canRedeem = availablePoints >= POINTS.minRedeem;
  const [pointsToUse, setPointsToUse] = useState(0);
  const productSubtotalYen = items.reduce((s, i) => i.freeGift ? s : s + effectiveYen(i.product, i.size) * i.quantity, 0);
  // Sem buffer para taxas fixas em ¥ (ex.: taxa PS): evita exibir ¥2.050 em vez de ¥2.000
  const convertYenExact = (yen: number) => fxConvert(yen, currency, true);
  const maxRedeemable = canRedeem ? Math.min(availablePoints, Math.floor(productSubtotalYen / POINTS.yenPerPoint)) : 0;
  const redeemPoints = Math.max(0, Math.min(pointsToUse, maxRedeemable));
  // Quanto do cupom em ienes (mesmo cálculo que o servidor)
  const couponDiscountYen = couponYenFor(items.map((i) => checkoutLineFromItem({ product: i.product, size: i.size, quantity: i.quantity, freeGift: i.freeGift })), (appliedCoupon ?? null) as CheckoutCoupon | null);
  // Pedido zerado por pontos: resgate cobre toda a mercadoria após cupom.
  // Quando verdadeiro, taxa PS é cobrada cheia (sem negociação nem isenção de popup).
  const netProductsAfterCouponAndPoints = productSubtotalYen - couponDiscountYen - redeemPoints;
  const pointsCoverAllProducts = productSubtotalYen > 0 && redeemPoints > 0 && netProductsAfterCouponAndPoints <= 0;

  // O popup global precisa conhecer a cobertura líquida (cupom + pontos) antes
  // de o cliente avançar para a revisão. Sem este sinal ele oferecia zerar a
  // taxa PS porque `redeem_points` só era persistido no botão de avançar.
  useEffect(() => {
    safeStorage.setItem('redeem_points', String(redeemPoints));
    checkoutPointsCoverage.set(pointsCoverAllProducts);
  }, [pointsCoverAllProducts, redeemPoints]);

  // Erros de validação do formulário
  const [errors, setErrors] = useState<FieldErrors>({});

  // PS fee — ¥/unidade comprada (exceto produtos isentos: noPsFee). Fixa em
  // ¥1.000: é o valor que o servidor cobra (`shared/money.js`). Um valor
  // diferente configurado no painel nunca chegou à cobrança, só à tela.
  const psFeeUnitYen = PS_FEE_PER_UNIT_YEN;

  // Mesma cotação pode estar minutos/horas desatualizada (carregada no boot
  // do app) — busca de novo ao entrar no checkout pra reduzir a divergência
  // com a cotação que o servidor busca na hora de criar o pedido.
  const [, setFxRatesTick] = useState(0);
  useEffect(() => {
    loadFxRates().then(() => setFxRatesTick((v) => v + 1)).catch(() => {});
  }, []);
  const totalQty = items.reduce((s, i) => i.freeGift ? s : s + i.quantity, 0);
  const psFeeQty = items.reduce((s, i) => (i.freeGift || i.product.noPsFee) ? s : s + i.quantity, 0);
  const psFeeYen = psFeeQty * psFeeUnitYen;
  // Desconto automático: ¥300 por unidade (o mesmo teto que o servidor aceita).
  const psFeeAutoApprovableUnitYen = PS_FEE_AUTO_DISCOUNT_PER_UNIT_YEN;

  // Isenção da taxa PS pela oferta de saída (exit-intent). Lida uma vez ao montar:
  // se ativa, a taxa de Personal Shopper é zerada nesta visita (ponto 2 do checkout).
  // Reativo: se a isenção for concedida enquanto já estamos no checkout
  // (ex.: aceitar a oferta no popup de saída), o valor atualiza sem remontar.
  const [psFeeWaived, setPsFeeWaived] = useState(() => psFeeWaiver.isActive());
  useEffect(() => {
    const sync = () => setPsFeeWaived(psFeeWaiver.isActive());
    window.addEventListener(PS_FEE_WAIVER_EVENT, sync);
    return () => window.removeEventListener(PS_FEE_WAIVER_EVENT, sync);
  }, []);

  const isGuest = !!location.state?.isGuest;

  // Negociação ativa — carregada APENAS via router state (Continuar pedido ou auto-aprovação).
  // Não usa localStorage no init: assim Ctrl+Shift+R limpa qualquer negociação pendente.
  const [activeNegId, setActiveNegId] = useState<string | null>(location.state?.activeNegId || null);
  const [activeNeg, setActiveNeg] = useState<Negotiation | null>(null);
  const [psFeeDiscountYen, setPsFeeDiscountYen] = useState(0);
  const [shippingDiscountYen, setShippingDiscountYen] = useState(0);

  // Modal de negociação
  const [negModalType, setNegModalType] = useState<'ps_fee' | 'shipping' | null>(null);
  const [negRequest, setNegRequest] = useState('');
  const [negNote, setNegNote] = useState('');
  const [negSubmitting, setNegSubmitting] = useState(false);

  // When the header language/country changes, mirror it into the form.
  // The reverse sync happens in the SELECT's onChange (calls setSelectedCountry directly).
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      country: selectedCountry
    }));
  }, [selectedCountry]);

  // Negociação ativa só é restaurada via localStorage (definido pelo botão "Continuar pedido"
  // no perfil). Não buscamos no Firestore para evitar aplicar descontos de pedidos anteriores.

  // Escuta em tempo real a negociação ativa
  useEffect(() => {
    if (!activeNegId) return;
    return negotiationService.listenById(activeNegId, (neg) => {
      const clearNeg = () => {
        setActiveNegId(null);
        setActiveNeg(null);
        setPsFeeDiscountYen(0);
        setShippingDiscountYen(0);
        localStorage.removeItem('activeNegId');
      };

      // Documento deletado ou negociação inválida → limpa estado
      if (!neg) { clearNeg(); return; }

      // Negociação já usada, rejeitada, expirada ou fora do prazo de 24h → limpa
      if (
        neg.status === 'used' ||
        neg.status === 'rejected' ||
        neg.status === 'expired' ||
        new Date(neg.expiresAt) < new Date()
      ) {
        clearNeg();
        return;
      }

      setActiveNeg(neg);
      if ((neg.status === 'approved' || neg.status === 'auto_approved') && neg.approvedDiscountYen != null) {
        if (neg.type === 'ps_fee') setPsFeeDiscountYen(neg.approvedDiscountYen);
        else setShippingDiscountYen(neg.approvedDiscountYen);
      }
      // Auto-expire LOCAL: quando o prazo estourou, a UI já trata como expirada
      // (o clearNeg acima dispara pelo teste de data em neg.expiresAt). A escrita
      // do status 'expired' no Firestore fica com o painel admin
      // (NegotiationManager, sob sessão admin): a regra de update de
      // /negotiations/ proíbe o cliente mudar status (só libera clientSeen), então
      // tentar gravar 'expired' daqui seria sempre rejeitado pelo Firebase.
    });
  }, [activeNegId]);

  // Aplica um cupom do perfil (já validado pelo CouponSelector)
  const handleCouponApply = (coupon: Coupon, discount: number) => {
    setAppliedCoupon(coupon);
    setCouponDiscount(discount);
  };

  const handleCouponRemove = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
  };

  // Load from state if returning from order-review page
  useEffect(() => {
    if (location.state?.formData) {
      setFormData(location.state.formData);
    }
  }, [location.state]);

  // Pré-aplica o cupom escolhido no carrinho (uma única vez)
  const cartCouponApplied = useRef(false);
  useEffect(() => {
    const cartCoupon = location.state?.coupon as Coupon | undefined;
    if (!cartCouponApplied.current && cartCoupon && baseTotalPrice > 0) {
      cartCouponApplied.current = true;
      setAppliedCoupon(cartCoupon);
      setCouponDiscount(computeCouponDiscount(cartCoupon, regularSubtotalForCoupon));
    }
  }, [location.state, baseTotalPrice, regularSubtotalForCoupon]);

  // Auto-populate from user profile if authenticated
  useEffect(() => {
    if (isAuthenticated && user && !location.state?.formData) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        cpf: user.cpf || '',
        postalCode: user.address?.postalCode || '',
        prefecture: user.address?.prefecture || '',
        city: user.address?.city || '',
        address: user.address?.address || '',
        building: user.address?.building || '',
        country: selectedCountry,
      });
    }
  }, [isAuthenticated, user, location.state, selectedCountry]);

  // Exige login — pedido sem conta não é salvo no Firestore e o admin nunca vê
  useEffect(() => {
    if (authReady && !isAuthenticated && !isGuest) {
      navigate('/cadastro', { state: { from: '/checkout' } });
    }
  }, [isAuthenticated, authReady, navigate, isGuest]);

  // Redirect if cart is empty
  useEffect(() => {
    if (items.length === 0) {
      navigate('/carrinho');
    }
  }, [items.length, navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const nextValue = name === 'phone' ? maskPhone(value) : value;
    setFormData(prev => ({
      ...prev,
      [name]: nextValue
    }));
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Auto address lookup by CEP/Postal Code
  const handlePostalCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Lê o país do DOM diretamente para evitar closure stale quando o país acabou de mudar
    const countrySelect = document.getElementById('country') as HTMLSelectElement | null;
    const currentCountry = countrySelect?.value || formData.country;

    if (currentCountry === 'Japão') {
      const cleanVal = val.replace(/[-\s]/g, '').slice(0, 7);
      let formatted = cleanVal;
      if (cleanVal.length > 3) {
        formatted = `${cleanVal.slice(0, 3)}-${cleanVal.slice(3, 7)}`;
      }
      setFormData(prev => ({ ...prev, postalCode: formatted }));

      if (cleanVal.length === 7) {
        try {
          const result = await lookupJapaneseAddress(cleanVal);
          if (result) {
            // Map the Japanese province name (e.g. "三重県") to the Portuguese identifier (e.g. "Mie")
            const matchedPref = japanPrefectures.find(p => p.nameJa === result.province);
            setFormData(prev => ({
              ...prev,
              prefecture: matchedPref ? matchedPref.name : '',
              city: result.city,
              address: result.town,
            }));
            toast({
              title: t('checkout.postalFound'),
              description: `${result.province} ${result.city} ${result.town}`,
            });
          } else {
            toast({
              title: t('checkout.postalError'),
              description: t('checkout.jpAddressNotFound'),
              variant: "destructive",
            });
          }
        } catch (error) {
          devError('Erro ao buscar CEP japonês:', error);
        }
      }
    } else if (currentCountry === 'Brasil') {
      const cleanVal = val.replace(/\D/g, '').slice(0, 8);
      let formatted = cleanVal;
      if (cleanVal.length > 5) {
        formatted = `${cleanVal.slice(0, 5)}-${cleanVal.slice(5, 8)}`;
      }
      setFormData(prev => ({ ...prev, postalCode: formatted }));

      if (cleanVal.length === 8) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(`https://viacep.com.br/ws/${cleanVal}/json/`, { signal: controller.signal });
          clearTimeout(timeoutId);
          const data = await response.json();

          if (response.ok && !data.erro) {
            const stateCode = data.uf || '';
            const addressString = data.logradouro
              ? `${data.logradouro}${data.bairro ? `, Bairro: ${data.bairro}` : ''}`
              : '';
            setFormData(prev => ({
              ...prev,
              prefecture: stateCode,
              city: data.localidade || '',
              address: addressString,
            }));
            toast({ title: t('checkout.cepFound'), description: `${data.localidade} - ${stateCode}` });
          } else {
            toast({ title: t('checkout.cepNotFound'), description: t('checkout.fillManually'), variant: "destructive" });
          }
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === 'AbortError') {
            toast({ title: t('checkout.viaCepDown'), description: t('checkout.viaCepSlow'), variant: "destructive" });
          } else {
            devError('Erro ao buscar CEP:', error);
          }
        }
      }
    } else if (getCountryConfig(currentCountry)?.zipLookup) {
      // Busca via zippopotam.us (gratuito) — todos os países da tabela com zipLookup
      const cfg = getCountryConfig(currentCountry)!;
      const cc = cfg.iso.toUpperCase();
      const isUsState = currentCountry === 'Estados Unidos';

      // Formatação: Portugal XXXX-XXX; demais mantém o que o usuário digitou (formatos variam por país)
      let formatted = val;
      if (currentCountry === 'Portugal') {
        const digits = val.replace(/\D/g, '').slice(0, 7);
        formatted = digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
      } else if (['Estados Unidos', 'França', 'Itália', 'Espanha', 'Alemanha'].includes(currentCountry)) {
        formatted = val.replace(/\D/g, '').slice(0, 5);
      } else {
        formatted = val.trim().slice(0, 12); // outros países: CEP alfanumérico (UK, CA, etc.)
      }
      setFormData(prev => ({ ...prev, postalCode: formatted }));

      // Dispara a busca quando o CEP parece completo (>= 3 chars). Trata erro silencioso.
      const probe = formatted.replace(/\s/g, '');
      if (probe.length >= 3) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        try {
          const res = await fetch(
            `https://api.zippopotam.us/${cc}/${encodeURIComponent(formatted)}`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            const place = data.places?.[0];
            if (place) {
              const stateValue = isUsState
                ? (place['state abbreviation'] || place['state'] || '')
                : (place['state'] || '');
              setFormData(prev => ({
                ...prev,
                city: place['place name'] || prev.city,
                prefecture: stateValue || prev.prefecture,
              }));
              toast({
                title: t('checkout.postalFound'),
                description: `${place['place name']} — ${place['state']}`,
              });
            }
          }
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name !== 'AbortError') {
            devError('Erro ao buscar código postal:', error);
          }
        }
      }
    } else {
      setFormData(prev => ({ ...prev, postalCode: val }));
    }
  };

  // CPF Input formatting
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
    let formatted = val;
    if (val.length > 9) {
      formatted = `${val.slice(0, 3)}.${val.slice(3, 6)}.${val.slice(6, 9)}-${val.slice(9, 11)}`;
    } else if (val.length > 6) {
      formatted = `${val.slice(0, 3)}.${val.slice(3, 6)}.${val.slice(6, 9)}`;
    } else if (val.length > 3) {
      formatted = `${val.slice(0, 3)}.${val.slice(3, 6)}`;
    }
    setFormData(prev => ({ ...prev, cpf: formatted }));
    if (errors.cpf) {
      setErrors(prev => {
        const next = { ...prev };
        delete next.cpf;
        return next;
      });
    }
  };

  const handleNegotiationSubmit = async () => {
    if (!user || !negModalType) return;
    const requestedYen = parseInt(negRequest, 10) || 0;
    if (requestedYen <= 0) {
      toast({ title: t('checkout.negNeedAmount'), variant: 'destructive' });
      return;
    }
    const originalYen = negModalType === 'ps_fee' ? psFeeYen : (selectedShipping?.costYen || 0);
    if (requestedYen >= originalYen) {
      toast({ title: t('checkout.negTooHigh'), variant: 'destructive' });
      return;
    }
    setNegSubmitting(true);
    try {
      // Freeze the exchange rate at this exact moment so approved ¥ → R$ never drifts
      const rates = getRates();
      const frozenRate = currency === 'EUR' ? rates.EUR : currency === 'USD' ? rates.USD : currency === 'JPY' ? 1 : rates.BRL;

      const neg = await negotiationService.create({
        userName: user.name || '',
        cartItems: items.filter(i => !i.freeGift).map(i => ({
          productId: i.product.id,
          productName: i.product.name || '',
          productImage: i.product.image || '',
          size: i.size || '',
          variantLabel: i.variantLabel || '',
          quantity: i.quantity,
          priceYen: effectiveYen(i.product, i.size),
        })),
        checkoutForm: {
          name: formData.name || '',
          email: formData.email || '',
          phone: formData.phone || '',
          cpf: formData.cpf || '',
          postalCode: formData.postalCode || '',
          prefecture: formData.prefecture || '',
          city: formData.city || '',
          address: formData.address || '',
          building: formData.building || '',
          country: formData.country || '',
        },
        shipping: selectedShipping ? {
          carrier: selectedShipping.carrier || '',
          cost: selectedShipping.cost ?? 0,
          costYen: selectedShipping.costYen ?? 0,
          estimatedDays: selectedShipping.estimatedDays || '',
        } : null,
        deliveryTime: deliveryTime || '',
        currency,
        exchangeRateAtCreation: frozenRate ?? 0,
        type: negModalType,
        originalAmountYen: originalYen,
        numUnits: totalQty,
        requestedDiscountYen: requestedYen,
        clientNote: negNote || '',
      });
      setActiveNegId(neg.id);
      setActiveNeg(neg);
      toast({ title: `📩 ${t('checkout.negSent')}`, description: t('checkout.negSentDesc') });
      setNegModalType(null);
      setNegRequest('');
      setNegNote('');
    } catch (err) {
      devError('Erro ao criar negociação:', err);
      toast({ title: t('checkout.negError'), variant: 'destructive' });
    }
    setNegSubmitting(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Valida os campos do formulário
    const fieldErrors = runValidations({
      name: () => (isNonEmpty(formData.name, 2) ? null : t('checkout.vName')),
      email: () => (isValidEmail(formData.email) ? null : t('checkout.vEmail')),
      phone: () => (isValidPhone(formData.phone) ? null : t('checkout.vPhone')),
      cpf: () =>
        formData.country === 'Brasil'
          ? isValidCPF(formData.cpf)
            ? null
            : t('checkout.vCpf')
          : null,
      postalCode: () => (isNonEmpty(formData.postalCode, 4) ? null : t('checkout.vPostal')),
      prefecture: () => (isNonEmpty(formData.prefecture) ? null : t('checkout.vState')),
      city: () => (isNonEmpty(formData.city) ? null : t('checkout.vCity')),
      address: () => (isNonEmpty(formData.address, 3) ? null : t('checkout.vStreet')),
    });
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length > 0) {
      toast({
        title: t('checkout.checkFields'),
        description: t('checkout.checkFieldsDesc'),
        variant: 'destructive',
      });
      return;
    }

    if (!selectedShipping) {
      toast({
        title: t('checkout.shipPending'),
        description: t('checkout.shipPendingDesc'),
        variant: "destructive",
      });
      return;
    }

    // Navigate to order review page
    safeStorage.setItem('redeem_points', String(redeemPoints));
    navigate('/order-review', {
      state: {
        formData,
        shipping: selectedShipping,
        deliveryTime,
        coupon: appliedCoupon,
        couponDiscount,
        psFeeYen,
        psFeeDiscountYen: effectivePsFeeDiscountYen,  // capped to current cart — anti-manipulation
        shippingDiscountYen,
        negotiationId: activeNegId,
        isGuest,
      }
    });
  };


  // PS fee final — para auto-aprovação, cap impede manipulação de carrinho.
  // Para aprovação manual pelo admin, respeita o valor aprovado (apenas cap no valor real da taxa).
  const maxAutoApprovable = psFeeAutoApprovableUnitYen * psFeeQty;
  const isManualApproval = activeNeg?.status === 'approved';
  const negPsFeeDiscountYen = isManualApproval
    ? Math.min(psFeeDiscountYen, psFeeYen)
    : Math.min(psFeeDiscountYen, maxAutoApprovable);
  // Oferta de saída isenta a taxa por completo e tem prioridade sobre a negociação
  // (limitada ao valor real da taxa — nunca desconta mais do que a taxa atual).
  const effectivePsFeeDiscountYen = pointsCoverAllProducts ? 0 : (psFeeWaived ? psFeeYen : negPsFeeDiscountYen);
  const psFeeFinalYen = Math.max(0, psFeeYen - effectivePsFeeDiscountYen);
  const psFeeOriginalDisplay = convertYenExact(psFeeYen);

  // Conta do checkout: a MESMA do servidor (shared/money.js). A forma de
  // pagamento ainda não foi escolhida aqui: as taxas do PIX (IOF + tarifa) entram
  // na revisão, que é onde o cliente escolhe PIX ou cartão.
  const checkoutLines = items.map((i) => checkoutLineFromItem({ product: i.product, size: i.size, quantity: i.quantity, freeGift: i.freeGift }));
  const checkoutRates = { ...getRates(), source: getRateSource() };
  const totals = clientCheckoutTotals({
    lines: checkoutLines,
    coupon: (appliedCoupon ?? null) as CheckoutCoupon | null,
    redeemPoints,
    paymentMethod: '',
    currency,
    country: formData.country,
    rates: checkoutRates,
    finalShippingYen: Math.max(0, (selectedShipping?.costYen ?? 0) - shippingDiscountYen),
    negotiatedPsDiscountYen: effectivePsFeeDiscountYen,
  });
  // O mesmo carrinho sem nenhum desconto (cupom, pontos, taxa PS, frete): é o
  // total riscado e a economia que o cliente vê, pela mesma conta.
  const totalsWithoutDiscounts = clientCheckoutTotals({
    lines: checkoutLines,
    coupon: null,
    redeemPoints: 0,
    paymentMethod: '',
    currency,
    country: formData.country,
    rates: checkoutRates,
    finalShippingYen: Math.max(0, selectedShipping?.costYen ?? 0),
    negotiatedPsDiscountYen: 0,
  });
  const totalSavings = Math.max(0, totalsWithoutDiscounts.total - totals.total);
  const shippingDiscountDisplay = Math.max(0, totalsWithoutDiscounts.display.shipping - totals.display.shipping);
  const importDutyDisplay = totals.display.importDuty;
  const couponDiscount = totals.display.couponDiscount;
  const pointsDiscount = totals.display.pointsDiscount;
  const actualShippingCost = totals.display.shipping;
  const psFeeDisplay = totals.display.psFee;
  const grandTotal = totals.total;

  const subtotalWithCoupon = baseTotalPrice - couponDiscount;
  
  // Tax estimates shown as warning only — NOT added to grandTotal
  let estimatedTax = 0;
  let taxLabel = '';

  {
    const r = calcImportTax(subtotalWithCoupon, formData.country, formData.prefecture);
    estimatedTax = r.tax;
    taxLabel = r.labelKey
      ? Object.entries(r.labelVars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, v), t(r.labelKey))
      : r.label;
  }
    
  // Taxes are completely omitted from checkout final price!

  // Check expiry (client-side) — purely derived, no side-effects here
  const negIsExpired = activeNeg ? negotiationService.isExpired(activeNeg) : false;

  const negIsPending = activeNeg?.status === 'pending' && !negIsExpired;
  const negIsApproved = activeNeg?.status === 'approved' || activeNeg?.status === 'auto_approved';
  const negIsRejected = activeNeg?.status === 'rejected';
  const negActuallyExpired = activeNeg?.status === 'expired' || negIsExpired;

  return (
    <Layout>
      {/* Modal de negociação */}
      {negModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Handshake className="w-5 h-5 text-primary" />
                <h3 className="font-display font-bold text-lg text-foreground">
                  {negModalType === 'ps_fee' ? t('checkout.negPsTitle') : t('checkout.negShipTitle')}
                </h3>
              </div>
              <button onClick={() => { setNegModalType(null); setNegRequest(''); setNegNote(''); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-secondary/40 rounded-xl p-4 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {negModalType === 'ps_fee' ? t('checkout.psFeeRow').replace('{qty}', String(psFeeQty)).replace('{unit}', `¥${psFeeUnitYen.toLocaleString()}`) : t('checkout.shipSelected')}
                </span>
                <span className="font-semibold">
                  ¥{(negModalType === 'ps_fee' ? psFeeYen : (selectedShipping?.costYen || 0)).toLocaleString()}
                </span>
              </div>
              {negModalType === 'ps_fee' && (
                <p className="text-xs text-primary font-medium">
                  {t('checkout.autoApprove').replace('{amount}', `¥${(psFeeAutoApprovableUnitYen * psFeeQty).toLocaleString()}`)}
                </p>
              )}
              {negModalType === 'shipping' && (
                <p className="text-xs text-pink-500 font-medium">
                  {t('checkout.shipNeedsApproval')}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">
                  {t('checkout.requestedYen')}
                </label>
                <input
                  type="number"
                  min="1"
                  value={negRequest}
                  onChange={e => setNegRequest(e.target.value)}
                  placeholder={t('checkout.exAmount')}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">
                  {t('checkout.messageOpt')}
                </label>
                <textarea
                  rows={2}
                  value={negNote}
                  onChange={e => setNegNote(e.target.value)}
                  placeholder={t('checkout.exMessage')}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setNegModalType(null); setNegRequest(''); setNegNote(''); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-secondary/60 transition-colors"
              >
                {t('checkout.cancel')}
              </button>
              <button
                onClick={handleNegotiationSubmit}
                disabled={negSubmitting || !negRequest}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {negSubmitting ? t('checkout.sending') : t('checkout.sendOffer')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {t('checkout.title')}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t('checkout.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto min-w-0">
            {/* Checkout Form */}
            <div className="lg:col-span-2 min-w-0">
              <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="font-sans text-xl font-bold text-foreground">
                    {t('checkout.deliveryData')}
                  </h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {isGuest && (
                    <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <span className="text-base shrink-0">👤</span>
                      <span>
                        <strong>{t('checkout.guestTitle')}</strong> — {t('checkout.guestDesc')}{' '}
                        <button type="button" onClick={() => navigate('/cadastro')} className="underline ml-1 font-semibold hover:text-amber-900">{t('checkout.createAccount')}</button> {t('checkout.guestBenefits')}
                      </span>
                    </div>
                  )}

                  {/* Personal Information */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      {t('checkout.personalInfo')}
                    </h3>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="flex items-center gap-2 font-semibold">
                          <User className="w-4 h-4 text-gray-500" />
                          {t('checkout.fullName')} *
                        </Label>
                        <Input
                          id="name"
                          name="name"
                          type="text"
                          placeholder={t('checkout.exName')}
                          value={formData.name}
                          onChange={handleInputChange}
                          aria-invalid={!!errors.name}
                          className={errors.name ? 'border-destructive' : ''}
                          required
                        />
                        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone" className="flex items-center gap-2 font-semibold">
                          <Phone className="w-4 h-4 text-gray-500" />
                          {t('checkout.phone')} *
                        </Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          placeholder={t('checkout.exPhone')}
                          value={formData.phone}
                          onChange={handleInputChange}
                          aria-invalid={!!errors.phone}
                          className={errors.phone ? 'border-destructive' : ''}
                          maxLength={13}
                          required
                        />
                        {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-2 font-semibold">
                          <Mail className="w-4 h-4 text-gray-500" />
                          {t('checkout.email')} *
                        </Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder={t('checkout.exEmail')}
                          value={formData.email}
                          onChange={handleInputChange}
                          aria-invalid={!!errors.email}
                          className={errors.email ? 'border-destructive' : ''}
                          required
                        />
                        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                      </div>

                    {formData.country === 'Brasil' && (
                      <div className="space-y-2">
                        <Label htmlFor="cpf" className="flex items-center gap-2 font-semibold">
                          <User className="w-4 h-4 text-gray-500" />
                          {t('checkout.cpfRequired')} *
                        </Label>
                        <Input
                          id="cpf"
                          name="cpf"
                          type="text"
                          placeholder="000.000.000-00"
                          value={formData.cpf}
                          onChange={handleCpfChange}
                          aria-invalid={!!errors.cpf}
                          className={errors.cpf ? 'border-destructive' : ''}
                          required
                        />
                        {errors.cpf ? (
                          <p className="text-xs text-destructive">{errors.cpf}</p>
                        ) : (
                          <p className="text-[10px] text-gray-400">
                            {t('checkout.cpfNote')}
                          </p>
                        )}
                      </div>
                    )}
                    </div>
                  </div>

                  {/* Shipping Address */}
                  <div className="space-y-4 pt-4 border-t border-gray-100">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      {t('address.title')}
                    </h3>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="country" className="font-semibold">
                          {t('checkout.country')} *
                        </Label>
                        <select
                          id="country"
                          name="country"
                          value={formData.country}
                          onChange={(e) => {
                            const val = e.target.value as CountryType;
                            setSelectedCountry(val);
                            setFormData(prev => ({
                              ...prev,
                              country: val,
                              prefecture: '',
                              postalCode: '',
                              city: '',
                              address: '',
                              building: '',
                            }));
                          }}
                          required
                          className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary transition-all font-medium text-sm"
                        >
                          {WORLD_COUNTRIES.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}{c.name === 'Japão' ? ` (${t('checkout.localShip')})` : ` (${t('checkout.intlShip')})`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="postalCode" className="font-semibold">
                          {formData.country === 'Japão' ? `${t('checkout.zipJp')} *` : formData.country === 'Estados Unidos' ? `${t('checkout.zipUs')} *` : ['Portugal', 'França', 'Itália', 'Espanha'].includes(formData.country) ? `${t('checkout.postalEu')} *` : `${t('checkout.cepBr')} *`}
                        </Label>
                        <Input
                          id="postalCode"
                          name="postalCode"
                          type="text"
                          placeholder={formData.country === 'Japão' ? '123-4567' : formData.country === 'Portugal' ? '0000-000' : ['França', 'Itália', 'Espanha', 'Estados Unidos'].includes(formData.country) ? '00000' : '00000-000'}
                          value={formData.postalCode}
                          onChange={handlePostalCodeChange}
                          required
                        />
                        <p className="text-[10px] text-gray-400">
                          {formData.country === 'Japão'
                            ? t('checkout.hintJp')
                            : formData.country === 'Portugal'
                            ? t('checkout.hintPt')
                            : formData.country === 'Estados Unidos'
                            ? t('checkout.hintUs')
                            : ['França', 'Itália', 'Espanha'].includes(formData.country)
                            ? t('checkout.hintEu')
                            : t('checkout.hintBr')}
                        </p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="prefecture" className="font-semibold">
                          {formData.country === 'Japão' ? t('checkout.provinceJp') : formData.country === 'Estados Unidos' ? t('checkout.stateUs') : ['Portugal', 'França', 'Itália', 'Espanha'].includes(formData.country) ? t('checkout.regionEu') : formData.country === 'Brasil' ? t('checkout.stateBr') : t('checkout.stateOther')}
                        </Label>
                        {(() => {
                          // Países com lista pronta usam select; os demais usam texto livre
                          const stateList =
                            formData.country === 'Japão' ? japanPrefectures
                            : formData.country === 'Estados Unidos' ? usStates
                            : formData.country === 'Brasil' ? prefectures
                            : ['Portugal', 'França', 'Itália', 'Espanha'].includes(formData.country)
                              ? (europePrefectures[formData.country] || [])
                              : null;
                          if (!stateList) {
                            // Texto livre (preenchido automaticamente pelo CEP quando disponível)
                            return (
                              <Input
                                id="prefecture"
                                name="prefecture"
                                type="text"
                                placeholder={t('checkout.stateRegionPh')}
                                value={formData.prefecture}
                                onChange={handleInputChange}
                                required
                              />
                            );
                          }
                          return (
                            <select
                              id="prefecture"
                              name="prefecture"
                              value={formData.prefecture}
                              onChange={handleInputChange}
                              required
                              className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary transition-all font-medium text-sm"
                            >
                              <option value="">
                                {formData.country === 'Japão' ? t('checkout.chooseProvince')
                                  : formData.country === 'Estados Unidos' ? t('checkout.selectStateUs')
                                  : ['Portugal', 'França', 'Itália', 'Espanha'].includes(formData.country) ? t('checkout.chooseRegion')
                                  : t('checkout.chooseState')}
                              </option>
                              {stateList.map((pref) => (
                                <option key={pref.name} value={pref.name}>
                                  {pref.nameJa || pref.name} ({pref.name})
                                </option>
                              ))}
                            </select>
                          );
                        })()}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="city" className="font-semibold">
                          {t('checkout.city')} *
                        </Label>
                        <Input
                          id="city"
                          name="city"
                          type="text"
                          placeholder={t('checkout.exCity')}
                          value={formData.city}
                          onChange={handleInputChange}
                          aria-invalid={!!errors.city}
                          className={errors.city ? 'border-destructive' : ''}
                          required
                        />
                        {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="address" className="font-semibold">
                        {t('checkout.street')} *
                      </Label>
                      <Input
                        id="address"
                        name="address"
                        type="text"
                        placeholder={t('checkout.exStreet')}
                        value={formData.address}
                        onChange={handleInputChange}
                        aria-invalid={!!errors.address}
                        className={errors.address ? 'border-destructive' : ''}
                        required
                      />
                      {errors.address && <p className="text-xs text-destructive">{errors.address}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="building" className="font-semibold">
                        {t('checkout.complement')}
                      </Label>
                      <Input
                        id="building"
                        name="building"
                        type="text"
                        placeholder={t('checkout.exComplement')}
                        value={formData.building}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>

                  {/* Shipping Calculator Section */}
                  <div className="pt-4 border-t border-border">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-4">
                      {t('checkout.shipMethodIntl')}
                    </h3>
                    <ShippingCalculator 
                      selectedPrefecture={formData.prefecture}
                      onShippingSelect={setSelectedShipping}
                      destinationCountry={formData.country as CountryType}
                    />
                  </div>

                  <div className="pt-4 border-t border-border">
                    {negIsPending ? (
                      <div className="w-full rounded-xl border-2 border-dashed border-pink-300 bg-pink-50 dark:bg-pink-950/20 p-4 text-center space-y-1">
                        <div className="flex items-center justify-center gap-2 text-pink-600 font-bold">
                          <Hourglass className="w-4 h-4 animate-pulse" />
                          {t('checkout.awaiting')}
                        </div>
                        <p className="text-xs text-pink-500">
                          {t('checkout.expires24')}
                        </p>
                      </div>
                    ) : negActuallyExpired ? (
                      <div className="space-y-2">
                        <div className="w-full rounded-xl border border-gray-300 bg-gray-50 dark:bg-gray-900/30 p-3 text-center text-xs text-muted-foreground">
                          {t('checkout.expiredNoReply')}
                          <button
                            type="button"
                            onClick={() => { setActiveNegId(null); setPsFeeDiscountYen(0); setShippingDiscountYen(0); localStorage.removeItem('activeNegId'); }}
                            className="block mx-auto mt-1 text-primary hover:underline font-semibold"
                          >
                            {t('checkout.clearRetry')}
                          </button>
                        </div>
                        <Button type="submit" className="w-full btn-primary rounded-xl py-6 text-lg font-bold" disabled={!selectedShipping}>
                          {t('checkout.goReview')} <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      </div>
                    ) : (

                      <>
                        <Button
                          type="submit"
                          className="w-full btn-primary rounded-xl py-6 text-lg font-bold"
                          disabled={!selectedShipping}
                        >
                          {t('checkout.goReview')}
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                        {!selectedShipping && (
                          <p className="text-xs text-muted-foreground text-center mt-2">
                            {t('checkout.selectShipFirst')}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </form>
              </div>
            </div>

            {/* Order Summary Sidebar */}
            <div className="lg:col-span-1 min-w-0">
              <div className="sticky top-24 bg-card rounded-2xl border border-border p-6 space-y-6 shadow-sm min-w-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="font-sans text-lg font-bold text-foreground">
                    {t('checkout.summary')}
                  </h2>
                </div>

                <div className="space-y-4">
                  {items.map((item) => {
                    const displayItemPrice = item.freeGift ? 0 : fxConvert(effectiveYen(item.product, item.size), currency) * item.quantity;
                    const productName = productEnglishName(item.product);
                    return (
                      <div
                        key={`${item.product.id}-${item.size}${item.freeGift ? '-gift' : ''}`}
                        className={`flex items-center gap-3 pb-3 border-b border-border${item.freeGift ? ' bg-purple-50 dark:bg-purple-950/20 rounded-lg px-2 pt-2' : ''}`}
                      >
                        <img
                          src={item.product.image}
                          alt={productName}
                          className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs text-gray-800 truncate">{productName}</p>
                          <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                            {item.freeGift ? `🎁 ${t('cartItem.promoGift')}` : (item.variantLabel || (item.size === 'small' ? t('review.small') : t('review.large')))} • {item.quantity}x
                          </p>
                        </div>
                        <p className={`font-bold text-xs ${item.freeGift ? 'text-green-600' : 'text-gray-800'}`}>
                          {item.freeGift ? t('cartItem.free') : formatPrice(displayItemPrice, currency)}
                        </p>
                      </div>
                    );
                  })}

                  {/* Coupon Selector Widget — desativado (ver featureFlags.ts) */}
                  {COUPONS_ENABLED && (
                    <CouponSelector
                      totalPrice={regularSubtotalForCoupon}
                      onCouponApply={handleCouponApply}
                      onCouponRemove={handleCouponRemove}
                      appliedCoupon={appliedCoupon}
                    />
                  )}

                  {/* Points Redemption */}
                  {isAuthenticated && !isGuest && (
                    <div className={`rounded-xl p-3 border text-xs ${canRedeem ? 'bg-purple-50 dark:bg-purple-950/20 border-dashed border-purple-300' : 'bg-muted/40 border-border'}`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className={`w-3.5 h-3.5 ${canRedeem ? 'text-purple-600' : 'text-muted-foreground'}`} />
                        <span className={`font-bold ${canRedeem ? 'text-purple-800 dark:text-purple-300' : 'text-muted-foreground'}`}>
                          {t('checkout.pointsTitle')} ({availablePoints} {t('review.available')})
                        </span>
                      </div>
                      {!canRedeem ? (
                        <p className="text-muted-foreground leading-snug">
                          {t('checkout.minPts1')} <strong>{POINTS.minRedeem} {t('checkout.minPts2')}</strong> {t('checkout.minPts3')} <strong>{POINTS.minRedeem - availablePoints}</strong> {t('checkout.minPts4')}
                        </p>
                      ) : (
                        <>
                          <p className="text-purple-700 mb-2 leading-snug">{t('checkout.pointsRule').replace('{max}', String(maxRedeemable))}</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="number" min={0} max={maxRedeemable}
                              value={pointsToUse || ''}
                              onChange={e => setPointsToUse(Math.max(0, Math.min(maxRedeemable, Number(e.target.value) || 0)))}
                              placeholder="0"
                              className="w-24 px-2 py-1.5 rounded-lg border border-purple-300 bg-background text-sm"
                            />
                            <button type="button" onClick={() => setPointsToUse(maxRedeemable)}
                              className="text-xs font-semibold text-purple-700 hover:underline">
                              {t('checkout.useMax')}
                            </button>
                            {redeemPoints > 0 && (
                              <button type="button" onClick={() => setPointsToUse(0)}
                                className="text-xs text-muted-foreground hover:underline ml-auto">
                                {t('checkout.clear')}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Calculations breakdown */}
                  <div className="space-y-2 pt-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground min-w-0 truncate">{t('cart.subtotal')}</span>
                      <span className="font-semibold text-gray-800 shrink-0 whitespace-nowrap">{formatPrice(totals.display.subtotal, currency)}</span>
                    </div>

                    {appliedCoupon && couponDiscount > 0 && (
                      <div className="flex justify-between text-green-600 font-bold bg-green-50/50 p-1.5 rounded border border-dashed border-green-200">
                        <span>{t('checkout.discount')} ({appliedCoupon.code})</span>
                        <span>-{formatPrice(couponDiscount, currency)}</span>
                      </div>
                    )}

                    {redeemPoints > 0 && (
                      <div className="flex justify-between text-purple-700 font-bold bg-purple-50/60 p-1.5 rounded border border-dashed border-purple-200">
                        <span>{t('review.points')} ({redeemPoints} {t('review.ptsAbbr')})</span>
                        <span>-{formatPrice(pointsDiscount, currency)}</span>
                      </div>
                    )}

                    {/* Tax displays only as estimated warnings in sidebar */}
                    {formData.country !== 'Japão' && estimatedTax > 0 && (
                      <div className="bg-pink-50/50 dark:bg-pink-950/10 border border-pink-200/60 rounded-xl p-3 space-y-2 mt-2">
                        <div className="flex justify-between text-xs font-bold text-orange-850 dark:text-pink-300">
                          <span>{taxLabel}</span>
                          <span>{formatPrice(estimatedTax, currency)}</span>
                        </div>
                        <p className="text-[10px] text-pink-700 dark:text-pink-400 leading-relaxed font-semibold">
                          ⚠️ <strong>{t('cart.reminderLabel')}</strong> {t('checkout.taxReminder')}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {formData.country === 'Japão' ? t('review.freightLocal') : t('checkout.freightIntl')}
                      </span>
                      {selectedShipping ? (
                        <span className="font-semibold text-gray-800">
                          {formatPrice(actualShippingCost, currency)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">
                          {formData.country === 'Japão' ? t('checkout.awaitingProv') : t('checkout.awaitingState')}
                        </span>
                      )}
                    </div>

                    {selectedShipping && (
                      <div className="text-[10px] text-gray-400 text-right">
                        {selectedShipping.carrier} • {selectedShipping.estimatedDays} {t('checkout.days')}
                      </div>
                    )}

                    {/* Taxa Personal Shopper */}
                    {totalQty > 0 && (
                      <div className="pt-2 border-t border-border/60">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">{t('review.psFee')}</span>
                          <div className="text-right">
                            {effectivePsFeeDiscountYen > 0 ? (
                              <>
                                <span className="text-[10px] text-muted-foreground line-through mr-1">
                                  {currency === 'JPY' ? `¥ ${psFeeYen.toLocaleString()}` : `${formatPrice(psFeeOriginalDisplay, currency, true)} (¥ ${psFeeYen.toLocaleString()})`}
                                </span>
                                <span className="font-semibold text-green-600">
                                  {currency === 'JPY' ? `¥ ${psFeeFinalYen.toLocaleString()}` : `${formatPrice(psFeeDisplay, currency, true)} (¥ ${psFeeFinalYen.toLocaleString()})`}
                                </span>
                              </>
                            ) : (
                              <span className="font-semibold">
                                {currency === 'JPY' ? `¥ ${psFeeFinalYen.toLocaleString()}` : `${formatPrice(psFeeDisplay, currency, true)} (¥ ${psFeeFinalYen.toLocaleString()})`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">{totalQty}x ¥{psFeeUnitYen.toLocaleString()} • {t('checkout.purchaseService')}</span>
                          {psFeeWaived && (
                            <span className="text-[10px] text-green-600 font-bold flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" /> {t('checkout.waivedOffer')}
                            </span>
                          )}
                          {negIsApproved && activeNeg?.type === 'ps_fee' && (
                            <span className="text-[10px] text-green-600 font-bold flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" /> {t('checkout.approved')}
                            </span>
                          )}
                          {negIsPending && activeNeg?.type === 'ps_fee' && (
                            <span className="text-[10px] text-pink-500 font-bold flex items-center gap-0.5">
                              <Hourglass className="w-3 h-3" /> {t('checkout.waiting')}
                            </span>
                          )}
                          {negIsRejected && activeNeg?.type === 'ps_fee' && (
                            <span className="text-[10px] text-red-500 font-bold flex items-center gap-0.5">
                              <AlertCircle className="w-3 h-3" /> {t('checkout.rejected')}
                            </span>
                          )}
                          {negActuallyExpired && activeNeg?.type === 'ps_fee' && (
                            <span className="text-[10px] text-gray-400 font-bold flex items-center gap-0.5">
                              <AlertCircle className="w-3 h-3" /> {t('checkout.expired')}
                            </span>
                          )}
                        </div>
                        {/* A dona relatou que todo mundo passava batido pela taxa: o antigo link de
                            10px parecia rótulo, não convite. Agora é um alvo de toque cheio que
                            "respira" (pulse-zoom) até ser clicado. Texto "Pedir desconto" em vez de
                            "Negociar" porque nomeia o benefício, não o processo. */}
                        {!psFeeWaived && !activeNeg && !pointsCoverAllProducts && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => setNegModalType('ps_fee')}
                              className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-primary bg-pink-50 dark:bg-pink-950/20 text-sm font-bold text-pink-700 dark:text-pink-300 transition-colors hover:bg-pink-700 hover:text-white dark:hover:bg-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 animate-pulse-zoom hover:animate-none motion-reduce:animate-none"
                            >
                              <Handshake className="w-5 h-5 shrink-0" /> {t('checkout.askDiscount')}
                            </button>
                            <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
                              {t('checkout.negotiable').replace('{amount}', `¥${(300 * psFeeQty).toLocaleString()}`)}
                            </p>
                          </div>
                        )}
                        {pointsCoverAllProducts && (
                          <p className="text-xs text-muted-foreground mt-2 leading-snug">
                            {t('checkout.notNegotiable')}
                          </p>
                        )}
                        {psFeeWaived && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1 leading-snug">
                            {t('checkout.waiverNote')}
                          </p>
                        )}
                        {/* Negociar frete (aparece só depois de selecionar frete e sem negociação ativa) */}
                        {selectedShipping && !activeNeg && (
                          <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/40">
                            <span className="text-[10px] text-muted-foreground">{t('checkout.negotiateShip')}</span>
                            <button
                              type="button"
                              onClick={() => setNegModalType('shipping')}
                              className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                            >
                              <Handshake className="w-3 h-3" /> {t('checkout.negotiate')}
                            </button>
                          </div>
                        )}
                        {selectedShipping && shippingDiscountYen > 0 && (
                          <div className="flex items-center justify-between mt-1 text-[10px] text-green-600 font-bold">
                            <span>{t('checkout.shipDiscount')}</span>
                            <span>-{formatPrice(shippingDiscountDisplay, currency)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* EUA: imposto de importação pré-pago pela loja (DDP), dentro do total. */}
                    {importDutyDisplay > 0 && (
                      <div className="pt-2 border-t border-border/60">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('review.importDuty')}</span>
                          <span className="font-semibold text-gray-800">{formatPrice(importDutyDisplay, currency)}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                          {t('review.importDutyNote')}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-between pt-2 border-t border-border font-bold items-start">
                      <span className="text-sm">{t('checkout.totalToPay')}</span>
                      <div className="text-right">
                        {totalSavings > 0 && (
                          <p className="text-xs text-muted-foreground line-through font-normal">
                            {formatPrice(totalsWithoutDiscounts.total, currency)}
                          </p>
                        )}
                        <span className="text-base text-pink-600">
                          {formatPrice(grandTotal, currency)}
                        </span>
                        {totalSavings > 0 && (
                          <p className="text-[10px] text-green-600 font-bold mt-0.5">
                            {t('cart.youSave')} {formatPrice(totalSavings, currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Checkout;
