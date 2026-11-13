import { safeStorage } from '@/utils/storage';
import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Home, Mail, Printer, Copy, AlertCircle, Smartphone, CreditCard, FileText, ExternalLink, Gift } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { QRCodeSVG } from 'qrcode.react';
import { formatPrice } from '@/utils/currency';
import { convertYen } from '@/services/fxService';
import { paymentSettingsService } from '@/services/paymentSettingsService';
import { buildPixPayload } from '@/utils/pixPayload';
import { trackPurchase } from '@/lib/analytics';
import { useUser } from '@/context/UserContext';
import { referralService } from '@/services/referralService';
import { COMPANY_PROFILE } from '@/config/companyProfile';

type ConfirmedOrderItem = {
  image?: string;
  name?: string;
  size?: string;
  quantity: number;
  price: number;
};
const { international: WHATSAPP } = COMPANY_PROFILE.whatsapp;

const OrderConfirmation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useUser();
  const order = location.state?.order;
  const isGuest = !!location.state?.isGuest;
  const [showGuestModal, setShowGuestModal] = useState(isGuest);

  const [copied, setCopied] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [pixSettings, setPixSettings] = useState({ pixKey: '', pixReceiverName: 'NikkeyBox', pixCity: 'Sao Paulo' });

  useEffect(() => {
    paymentSettingsService.get().then((s) => {
      setPixSettings({ pixKey: s.pixKey || '', pixReceiverName: s.pixReceiverName || 'NikkeyBox', pixCity: s.pixCity || 'Sao Paulo' });
    });
  }, [order]);

  // Redirect if no order data is received
  useEffect(() => {
    if (!order) {
      navigate('/', { replace: true });
    }
  }, [order, navigate]);

  // Dispara purchase (GA4 + Meta Pixel) uma única vez por pedido — a guarda por
  // sessionStorage evita recontar a mesma compra em reload/voltar a esta página.
  useEffect(() => {
    if (!order) return;
    const guardKey = `analytics_purchase_${order.id}`;
    if (sessionStorage.getItem(guardKey)) return;
    sessionStorage.setItem(guardKey, '1');
    trackPurchase(
      order.id,
      order.currency,
      order.total,
      (order.items || []).map((item: { productId: string; productName: string; quantity: number; price: number; unitYen: number }) => ({
        item_id: item.productId,
        item_name: item.productName,
        quantity: item.quantity,
        price: item.price,
      })),
    );
  }, [order]);

  if (!order) return null;

  // PIX Copia e Cola real, gerado a partir da chave configurada pelo admin.
  // Se a chave ainda não foi cadastrada, fica vazio e a tela mostra um aviso.
  const pixPayload = pixSettings.pixKey
    ? buildPixPayload({
        key: pixSettings.pixKey,
        amount: Number(order.total) || 0,
        receiverName: pixSettings.pixReceiverName,
        city: pixSettings.pixCity,
        txid: String(order.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25),
      })
    : '';

  // Link de WhatsApp para o cliente enviar o comprovante do PIX.
  const waMessage = encodeURIComponent(
    `Olá! Acabei de fazer o pagamento PIX do pedido ${order.id} no valor de ${formatPrice(order.total, order.currency)}. Segue o comprovante:`
  );
  const whatsappComprovante = `https://wa.me/${COMPANY_PROFILE.whatsapp.digits}?text=${waMessage}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    toast({
      title: t('order.pixCopiedTitle'),
      description: t('order.pixCopiedDesc'),
    });
    setTimeout(() => setCopied(false), 3000);
  };

  const copyReferralLink = () => {
    if (!user?.id) return;
    navigator.clipboard.writeText(referralService.getReferralLink(user.id));
    setReferralCopied(true);
    toast({
      title: t('orderConfirmation.referral.copied'),
    });
    setTimeout(() => setReferralCopied(false), 3000);
  };


  const handlePrint = () => {
    window.print();
  };

  return (
    <Layout>
      <section className="py-12 bg-background min-h-screen">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">

            {/* Header Success Message */}
            <div className="text-center mb-8 print:hidden">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <h1 className="font-display text-4xl font-extrabold text-gray-900 mb-2">
                {order.currency === 'JPY' ? t('order.confirmed') : t('order.generated')}
              </h1>
              <p className="text-lg text-muted-foreground mb-2">
                {t('order.id')}: <span className="font-mono font-semibold text-gray-900">{order.orderNumber || order.id}</span>
              </p>
              <p className="text-muted-foreground text-sm">
                {order.paymentMethod === 'card'
                  ? t('order.cardApproved')
                  : t('order.thanks')}
              </p>
            </div>

            {/* Referral CTA — só para cliente logado (não-guest); guest não tem
                userId estável para gerar link de indicação. */}
            {!isGuest && user?.id && (
              <div className="mb-8 print:hidden bg-gradient-to-r from-purple-50 to-amber-50 border border-purple-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                  <Gift className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <p className="font-display font-bold text-gray-900">{t('orderConfirmation.referral.title')}</p>
                  <p className="text-sm text-muted-foreground">{t('orderConfirmation.referral.description')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-2"
                  onClick={copyReferralLink}
                >
                  {referralCopied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {t('orderConfirmation.referral.copyButton')}
                </Button>
              </div>
            )}

            {/* PAYMENT SCREENS */}

            {/* PIX SCREEN — pagamento manual com confirmação por comprovante */}
            {order.paymentMethod === 'pix' && (
              <div className="bg-white rounded-3xl border-2 border-primary p-6 mb-8 shadow-md print:hidden text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-purple-600 font-extrabold text-lg">
                  <Smartphone className="w-6 h-6" />
                  <span>{t('order.payViaPix')}</span>
                </div>

                {pixPayload ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 max-w-md mx-auto">
                      {t('order.pixPayPre')} <strong>{formatPrice(order.total, order.currency)}</strong> {t('order.pixScanQr')}
                      {t('order.pixScan2')}
                    </p>

                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 inline-block shadow-sm">
                      <QRCodeSVG value={pixPayload} size={200} includeMargin={true} />
                    </div>

                    <div className="max-w-md mx-auto space-y-2">
                      <p className="text-xs text-gray-500 font-bold uppercase">{t('order.copyPasteKey')}</p>
                      <div className="flex border border-gray-300 rounded-xl overflow-hidden shadow-sm bg-gray-50">
                        <input
                          type="text"
                          readOnly
                          value={pixPayload}
                          className="flex-1 px-3 py-2 text-xs font-mono text-gray-500 bg-transparent select-all outline-none"
                        />
                        <button
                          onClick={copyToClipboard}
                          className="bg-primary hover:bg-purple-600 text-white px-4 flex items-center justify-center gap-1.5 transition-all text-xs font-bold"
                        >
                          <Copy className="w-4 h-4" />
                          {copied ? t('order.copied') : t('order.copy')}
                        </button>
                      </div>
                    </div>

                    <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 max-w-md mx-auto space-y-3 text-left">
                      <p className="text-sm font-bold text-purple-700 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {t('order.importantProof')}
                      </p>
                      <p className="text-xs text-purple-700 leading-relaxed">
                        {t('order.pixProof1')} <strong>{t('order.pixProof2')}</strong> {t('order.pixProof3')}
                        {t('order.pixStatus1')} <strong>{t('order.pixStatus2')}</strong> {t('order.pixStatus3')}
                      </p>
                      <a
                        href={whatsappComprovante}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-3 rounded-xl transition-all"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t('order.sendReceipt')}
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6 max-w-md mx-auto space-y-2">
                    <AlertCircle className="w-8 h-8 text-yellow-600 mx-auto" />
                    <p className="text-sm font-bold text-yellow-800">{t('order.pixNotSet')}</p>
                    <p className="text-xs text-yellow-700 leading-relaxed">
                      {t('order.pixNotSetDesc1')}
                      <strong> {WHATSAPP}</strong> {t('order.pixNotSetDesc2')} <strong>{order.id}</strong>{t('order.pixNotSetDesc3')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* CREDIT CARD — pagamento já confirmado pelo Stripe antes de chegar nesta tela */}
            {order.paymentMethod === 'card' && (
              <div className="bg-white rounded-3xl border-2 border-primary p-6 mb-8 shadow-md print:hidden space-y-4">
                <div className="flex items-center gap-2 text-purple-600 font-extrabold text-lg justify-center">
                  <CreditCard className="w-6 h-6" />
                  <span>{t('order.payViaCard')}</span>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white mx-auto">
                    ✓
                  </div>
                  <h3 className="font-sans font-bold text-lg text-green-800">{t('order.cardApprovedTitle')}</h3>
                  <p className="text-xs text-green-700 max-w-sm mx-auto leading-relaxed">
                    {t('order.cardApprovedDesc')}
                  </p>
                  <button
                    onClick={() => navigate('/rastrear')}
                    className="text-xs font-bold text-green-800 underline hover:no-underline"
                  >
                    {t('order.trackOrder')}
                  </button>
                </div>
              </div>
            )}

            {/* BOLETO SCREEN */}
            {order.paymentMethod === 'boleto' && (
              <div className="bg-white rounded-3xl border-2 border-primary p-6 mb-8 shadow-md print:hidden text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-purple-600 font-extrabold text-lg">
                  <FileText className="w-6 h-6" />
                  <span>{t('order.boletoTitle')}</span>
                </div>

                <div className="bg-yellow-50 text-yellow-700 text-xs font-semibold px-4 py-3 rounded-xl inline-flex items-center gap-2 border border-yellow-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{t('order.boletoDue')}</span>
                </div>

                <div className="bg-gray-100 p-6 rounded-2xl max-w-md mx-auto border border-gray-300 font-mono text-xs flex flex-col items-center gap-3">
                  {/* Mock Barcode display */}
                  <div className="w-full h-12 bg-black flex items-center justify-center text-white text-[8px] tracking-[3px] select-none font-sans">
                    ||||| | ||||| | || ||||| | ||||| | || ||||| | ||||| | || ||||| | ||||| 
                  </div>
                  <p className="font-bold text-gray-800 text-[10px]">
                    34191.79001 01043.513184 91020.150008 7 926500000{(order.total * 100).toFixed(0).padStart(6, '0')}
                  </p>
                </div>

                <div className="flex justify-center gap-4">
                  <Button 
                    onClick={() => {
                      navigator.clipboard.writeText(`34191.79001 01043.513184 91020.150008 7 926500000${(order.total * 100).toFixed(0).padStart(6, '0')}`);
                      toast({ title: t('order.codeCopied'), description: t('order.lineCopied') });
                    }}
                    variant="outline"
                    className="border-2"
                  >
                    {t('order.copyBarcode')}
                  </Button>
                  <Button 
                    onClick={handlePrint}
                    variant="secondary"
                  >
                    {t('order.printBoleto')}
                  </Button>
                </div>
              </div>
            )}

            {/* ORDER CONFIRMATION INVOICE / RECIBO */}
            <div className="bg-card rounded-2xl border border-border p-8 mb-6">
              <div className="text-center mb-6 print:block hidden">
                <h1 className="font-display text-3xl font-bold mb-2">
                  NikkeyBox
                </h1>
                <p className="text-muted-foreground">
                  {order.currency === 'JPY' ? t('order.receipt.domestic') : t('order.receipt.intl')}
                </p>
                <p className="font-mono text-sm">{t('order.id')}: {order.orderNumber || order.id}</p>
                <p className="text-sm text-muted-foreground">{order.date}</p>
              </div>

              <div className="space-y-6">
                
                {/* Print Title Header */}
                <div className="flex items-center justify-between border-b pb-4">
                  <h3 className="font-sans font-bold text-lg text-foreground">
                    {order.currency === 'JPY' ? t('order.receipt.local') : t('order.receipt.import')}
                  </h3>
                  <Button onClick={handlePrint} variant="ghost" size="sm" className="print:hidden font-semibold">
                    <Printer className="w-4 h-4 mr-2" />
                    {t('order.print')}
                  </Button>
                </div>

                {/* Tracking Details — só aparece quando há código de rastreio */}
                {order.trackingCode && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs md:text-sm">
                  <div>
                    <span className="text-muted-foreground block">
                      {order.currency === 'JPY'
                        ? t('order.tracking.domestic')
                        : order.country === 'Brasil'
                          ? t('order.tracking.air.br')
                          : t('order.tracking.air.intl')}
                    </span>
                    <button
                      onClick={() => navigate('/rastrear')}
                      className="font-bold text-purple-700 underline hover:no-underline text-base"
                    >
                      {t('order.trackOrder')}
                    </button>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground block">{t('order.logisticStatus')}</span>
                    <span className="bg-purple-600 text-white font-extrabold px-2 py-0.5 rounded text-xs uppercase inline-block mt-1">
                      {order.status === 'Pago'
                        ? (order.currency === 'JPY' ? t('order.status.preparingDomestic') : t('order.status.waitingDispatch'))
                        : t('order.status.waiting')
                      }
                    </span>
                  </div>
                </div>
                )}

                {/* Customer Details */}
                <div className="grid md:grid-cols-2 gap-4 text-xs md:text-sm border-b pb-4">
                  <div>
                    <h4 className="font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('order.recipient')}</h4>
                    <p className="font-bold text-gray-800">{order.name}</p>
                    {order.currency !== 'JPY' && order.cpf && (
                      <p className="text-muted-foreground font-mono mt-0.5">{t('order.cpfLabel')} {order.cpf}</p>
                    )}
                    <p className="text-muted-foreground">{t('order.telLabel')} {order.phone}</p>
                    <p className="text-muted-foreground">{order.email}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('order.deliveryAddress')}</h4>
                    <p className="text-gray-800">〒 {order.postalCode}</p>
                    <p className="text-gray-800">
                      {order.prefecture}, {order.city}
                    </p>
                    <p className="text-gray-800">{order.address}</p>
                    {order.building && <p className="text-gray-500 text-xs">{t('order.complement')} {order.building}</p>}
                    <p className="font-bold text-gray-800 mt-1">
                      {order.country || 'Brasil'} {
                        order.country === 'Japão' ? '🇯🇵' :
                        order.country === 'Brasil' ? '🇧🇷' :
                        order.country === 'Portugal' ? '🇵🇹' :
                        order.country === 'França' ? '🇫🇷' :
                        order.country === 'Itália' ? '🇮🇹' :
                        order.country === 'Espanha' ? '🇪🇸' : '🇧🇷'
                      }
                    </p>
                  </div>
                </div>

                {/* Items list */}
                <div>
                  <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mb-2">
                    {t('order.items')}
                  </h4>
                  <div className="space-y-3">
                    {(order.items as ConfirmedOrderItem[]).map((item, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs md:text-sm border-b border-gray-100 pb-2 last:border-0">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {item.image && (
                            <img src={item.image} alt={item.name} className="w-8 h-8 rounded object-cover border border-gray-100" />
                          )}
                          <div className="truncate">
                            <p className="font-bold text-gray-800 truncate">{item.name}</p>
                            <p className="text-muted-foreground text-[10px]">{item.size} × {item.quantity}</p>
                          </div>
                        </div>
                        <p className="font-bold text-gray-800 shrink-0">
                          {formatPrice(item.price * item.quantity, order.currency || 'BRL')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Invoice Totals */}
                <div className="border-t pt-4 space-y-2 text-xs md:text-sm">
                  {(() => {
                    const itemsSubtotal = (order.items as ConfirmedOrderItem[] || []).reduce(
                      (s: number, i: ConfirmedOrderItem) => s + i.price * i.quantity, 0,
                    );
                    return (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('order.subtotal')}</span>
                        <span className="font-semibold text-gray-800">
                          {formatPrice(itemsSubtotal, order.currency || 'BRL')}
                        </span>
                      </div>
                    );
                  })()}

                  {order.couponDiscountYen > 0 && (
                    <div className="flex justify-between text-green-600 font-bold">
                      <span>{t('order.couponDiscount')} ({order.couponCode})</span>
                      <span>
                        -{formatPrice(
                          order.priceBreakdown?.couponDiscount ?? convertYen(order.couponDiscountYen, order.currency || 'BRL'),
                          order.currency || 'BRL',
                        )}
                      </span>
                    </div>
                  )}
                  {Number(order.priceBreakdown?.pointsDiscount) > 0 && (
                    <div className="flex justify-between text-purple-700 font-bold">
                      <span>{t('review.pointsDiscount')}</span>
                      <span>-{formatPrice(Number(order.priceBreakdown?.pointsDiscount), order.currency || 'BRL')}</span>
                    </div>
                  )}
                  {order.currency !== 'JPY' && order.taxAmount > 0 && (
                    <div className="bg-purple-50/50 dark:bg-purple-950/10 border border-purple-200/60 rounded-xl p-3 space-y-2 mt-2">
                      <div className="flex justify-between text-xs font-bold text-orange-850 dark:text-purple-300">
                        <span>{t('order.tax.estimate')}</span>
                        <span>{formatPrice(order.taxAmount, order.currency)}</span>
                      </div>
                      <p className="text-[10px] text-purple-700 dark:text-purple-400 leading-relaxed font-semibold">
                        {t('order.tax.note')}
                      </p>
                    </div>
                  )}

                  {order.psFeeYen > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('order.psFee')}</span>
                      <span className="font-semibold text-gray-800">
                        {formatPrice(
                          order.priceBreakdown?.psFee ?? convertYen(order.psFeeYen, order.currency || 'BRL', true),
                          order.currency || 'BRL',
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {order.currency === 'JPY' ? t('order.shipping.local') : t('order.shipping.intl')}
                    </span>
                    <span className="font-semibold text-gray-800">
                      {formatPrice(
                        order.priceBreakdown?.shipping ?? convertYen(order.shipping?.cost ?? 0, order.currency || 'BRL'),
                        order.currency || 'BRL',
                      )}
                    </span>
                  </div>

                  {Number(order.priceBreakdown?.importDuty) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('order.importDuty')}</span>
                      <span className="font-semibold text-gray-800">
                        {formatPrice(Number(order.priceBreakdown?.importDuty), order.currency || 'BRL')}
                      </span>
                    </div>
                  )}

                  {Number(order.priceBreakdown?.paymentFee) > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('order.pixIof')}</span>
                        <span className="font-semibold text-gray-800">
                          {formatPrice(Number(order.priceBreakdown?.pixIof), order.currency || 'BRL')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('order.pixBankFee')}</span>
                        <span className="font-semibold text-gray-800">
                          {formatPrice(Number(order.priceBreakdown?.pixBankFee), order.currency || 'BRL')}
                        </span>
                      </div>
                    </>
                  )}

                  <div className="flex justify-between pt-3 border-t font-black text-base md:text-lg">
                    <span>{t('order.total')}</span>
                    <span className="text-xl text-purple-600">
                      {formatPrice(order.total, order.currency || 'BRL')}
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* Back Button */}
            <div className="flex gap-4 print:hidden justify-center">
              <Button 
                onClick={() => navigate('/')}
                className="btn-primary rounded-xl py-6 text-base font-bold gap-2 px-8 shadow-md"
              >
                <Home className="w-5 h-5" />
                {t('order.backHome')}
              </Button>
            </div>

            {/* Simulated Logistics Milestones - Urgency & Trust */}
            <div className="mt-8 bg-gray-50 border border-gray-100 rounded-2xl p-6 print:hidden space-y-4">
              <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">
                {order.currency === 'JPY' ? t('order.followTitle.domestic') : t('order.followTitle.intl')}
              </h3>
              <div className="relative pl-6 border-l border-purple-300 space-y-4 text-xs text-muted-foreground">

                {order.currency === 'JPY' ? (
                  <>
                    {([
                      { title: t('order.steps.jp1.title'), desc: t('order.steps.jp1.desc'), done: true },
                      { title: t('order.steps.jp2.title'), desc: t('order.steps.jp2.desc'), done: false },
                      { title: t('order.steps.jp3.title'), desc: t('order.steps.jp3.desc'), done: false },
                      { title: t('order.steps.jp4.title'), desc: t('order.steps.jp4.desc'), done: false },
                    ] as const).map((step, i) => (
                      <div key={i} className="relative">
                        <div className={`absolute -left-[30px] top-0 w-4 h-4 ${step.done ? 'bg-primary' : 'bg-gray-300'} rounded-full border-2 border-white flex items-center justify-center text-white text-[8px]`}>{step.done ? '✓' : i + 1}</div>
                        <h4 className={`font-bold ${step.done ? 'text-gray-800' : 'text-gray-700'}`}>{step.title}</h4>
                        <p className="mt-0.5">{step.desc}</p>
                      </div>
                    ))}
                  </>
                ) : order.country === 'Brasil' ? (
                  <>
                    {([
                      { title: t('order.steps.br1.title'), desc: t('order.steps.br1.desc'), done: true },
                      { title: t('order.steps.br2.title'), desc: t('order.steps.br2.desc'), done: false },
                      { title: t('order.steps.br3.title'), desc: t('order.steps.br3.desc'), done: false },
                      { title: t('order.steps.br4.title'), desc: t('order.steps.br4.desc'), done: false },
                    ] as const).map((step, i) => (
                      <div key={i} className="relative">
                        <div className={`absolute -left-[30px] top-0 w-4 h-4 ${step.done ? 'bg-primary' : 'bg-gray-300'} rounded-full border-2 border-white flex items-center justify-center text-white text-[8px]`}>{step.done ? '✓' : i + 1}</div>
                        <h4 className={`font-bold ${step.done ? 'text-gray-800' : 'text-gray-700'}`}>{step.title}</h4>
                        <p className="mt-0.5">{step.desc}</p>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {([
                      { title: t('order.steps.intl1.title'), desc: t('order.steps.intl1.desc'), done: true },
                      { title: t('order.steps.intl2.title'), desc: t('order.steps.intl2.desc'), done: false },
                      { title: t('order.steps.intl3.title'), desc: t('order.steps.intl3.desc'), done: false },
                      { title: t('order.steps.intl4.title'), desc: t('order.steps.intl4.desc'), done: false },
                    ] as const).map((step, i) => (
                      <div key={i} className="relative">
                        <div className={`absolute -left-[30px] top-0 w-4 h-4 ${step.done ? 'bg-primary' : 'bg-gray-300'} rounded-full border-2 border-white flex items-center justify-center text-white text-[8px]`}>{step.done ? '✓' : i + 1}</div>
                        <h4 className={`font-bold ${step.done ? 'text-gray-800' : 'text-gray-700'}`}>{step.title}</h4>
                        <p className="mt-0.5">{step.desc}</p>
                      </div>
                    ))}
                  </>
                )}

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Guest account benefits popup */}
      {isGuest && showGuestModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-up">
            <div className="text-center mb-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🎉</span>
              </div>
              <h2 className="text-lg font-bold text-foreground">{t('order.guestTitle')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('order.guestSub')}</p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 mb-5">
              <p className="text-xs font-bold text-foreground mb-3 uppercase tracking-wide">{t('order.guestCta')}</p>
              <ul className="space-y-2 text-sm text-foreground">
                <li className="flex items-center gap-2"><span>🎁</span> <span><strong>{t('order.perk1')}</strong> {t('order.perk1b')}</span></li>
                <li className="flex items-center gap-2"><span>📦</span> <span><strong>{t('order.perk2')}</strong> {t('order.perk2b')}</span></li>
                <li className="flex items-center gap-2"><span>🚚</span> <span><strong>{t('order.perk3')}</strong> {t('order.perk3b')}</span></li>
                <li className="flex items-center gap-2"><span>🎟️</span> <span><strong>{t('order.perk4')}</strong> {t('order.perk4b')}</span></li>
                <li className="flex items-center gap-2"><span>🤝</span> <span><strong>{t('order.perk5')}</strong> {t('order.perk5b')}</span></li>
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate('/cadastro')}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors"
              >
                {t('order.createAccount')}
              </button>
              <button
                onClick={() => setShowGuestModal(false)}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('order.continueGuest')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default OrderConfirmation;
