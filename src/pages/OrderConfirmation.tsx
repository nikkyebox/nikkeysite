import { safeStorage } from '@/utils/storage';
import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Home, Mail, Printer, Copy, AlertCircle, Smartphone, CreditCard, FileText, Landmark, Wallet, ExternalLink, Gift } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { QRCodeSVG } from 'qrcode.react';
import { formatPrice } from '@/utils/currency';
import { paymentSettingsService } from '@/services/paymentSettingsService';
import { buildPixPayload } from '@/utils/pixPayload';
import { trackPurchase } from '@/lib/analytics';
import { useUser } from '@/context/UserContext';
import { referralService } from '@/services/referralService';
import { COMPANY_PROFILE } from '@/config/companyProfile';

// O PayPay é app japonês e identifica a conta pelo número LOCAL: um cliente que
// digitar o formato internacional não encontra a loja. Já o WhatsApp é discado
// do Brasil, onde o DDI é obrigatório. Por isso os dois formatos convivem — o
// que não pode é cada tela escolher o seu, que foi como divergiram.
const { international: WHATSAPP, domestic: PAYPAY_ID } = COMPANY_PROFILE.whatsapp;

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
  const [wiseLink, setWiseLink] = useState('');
  const [pixSettings, setPixSettings] = useState({ pixKey: '', pixReceiverName: 'NikkeyBox', pixCity: 'Sao Paulo' });

  useEffect(() => {
    paymentSettingsService.get().then((s) => {
      setWiseLink(s.wiseLink || '');
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
      title: "Chave PIX Copiada!",
      description: "Código copiado para a área de transferência.",
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
                  ? 'Pagamento com cartão aprovado! Seu pedido já entrou em preparo.'
                  : t('order.thanks')}
              </p>
            </div>

            {/* Referral CTA — só para cliente logado (não-guest); guest não tem
                userId estável para gerar link de indicação. */}
            {!isGuest && user?.id && (
              <div className="mb-8 print:hidden bg-gradient-to-r from-pink-50 to-amber-50 border border-pink-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center shrink-0">
                  <Gift className="w-6 h-6 text-pink-600" />
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

            {/* PAYPAY SCREEN */}
            {order.paymentMethod === 'paypay' && (
              <div className="bg-white rounded-3xl border-2 border-pink-500 p-6 mb-8 shadow-md print:hidden text-center space-y-4 animate-fade-in">
                <div className="flex items-center justify-center gap-2 text-pink-600 font-extrabold text-lg">
                  <Smartphone className="w-6 h-6 animate-pulse" />
                  <span>{t('order.payAreaPayPay')}</span>
                </div>

                <div className="bg-red-50 text-red-700 text-xs font-semibold px-4 py-3 rounded-xl inline-flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{t('order.payDescPayPay')}</span>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 inline-block shadow-sm">
                  <img 
                    src="/products/paypay-qr.png" 
                    alt="PayPay QR Code - NikkeyBox" 
                    className="w-60 h-auto rounded-xl border border-gray-200 mx-auto shadow-md"
                    onError={(e) => {
                      e.currentTarget.src = "https://placehold.co/240x240/red/white?text=PayPay+QR";
                    }}
                  />
                  <p className="text-[10px] text-gray-400 mt-2 font-mono">
                    Escaneie com o app do PayPay
                  </p>
                </div>

                <div className="bg-gray-100 p-4 rounded-xl max-w-sm mx-auto text-xs space-y-2 font-mono text-left">
                  <p><strong className="text-gray-800">{t('order.sendTo')}</strong> NikkeyBox</p>
                  <p><strong className="text-gray-800">{t('order.phone')}</strong> {PAYPAY_ID}</p>
                  <p><strong className="text-gray-800">{t('order.value')}</strong> {formatPrice(order.total, 'JPY')}</p>
                </div>

                <div className="pt-2 text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
                  {t('order.transferNote')} <strong className="text-gray-800">{PAYPAY_ID}</strong>.
                </div>
              </div>
            )}

            {/* YUCHO SCREEN */}
            {order.paymentMethod === 'yucho' && (
              <div className="bg-white rounded-3xl border-2 border-pink-500 p-6 mb-8 shadow-md print:hidden space-y-4 animate-fade-in">
                <div className="flex items-center justify-center gap-2 text-pink-600 font-extrabold text-lg">
                  <Landmark className="w-6 h-6" />
                  <span>DEPÓSITO BANCÁRIO (Yucho Bank / ゆうちょ銀行)</span>
                </div>

                <div className="bg-yellow-50 text-yellow-700 text-xs font-semibold px-4 py-3 rounded-xl inline-flex items-center gap-2 border border-yellow-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Por favor, realize a transferência e nos envie o comprovante pelo WhatsApp ({WHATSAPP}).</span>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 max-w-md mx-auto space-y-3 font-mono text-xs md:text-sm text-left">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Banco:</span>
                    <span className="font-bold text-gray-800">ゆうちょ銀行 (Japan Post Bank)</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">記号 (Kigou):</span>
                    <span className="font-bold text-gray-800">12260</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">番号 (Bangou):</span>
                    <span className="font-bold text-gray-800">33664351</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Nome:</span>
                    <span className="font-bold text-gray-800">ロドリゲス シオカワ ミリアン パウラ</span>
                  </div>
                  
                  <div className="pt-3 border-t border-dashed text-[10px] text-gray-500 space-y-1">
                    <p className="font-bold">Para transferência de outros bancos (振込用):</p>
                    <p>金融機関コード (Cód. Banco): <strong className="text-gray-700">9900</strong></p>
                    <p>店名 (Agência): <strong className="text-gray-700">二二八店 (228)</strong></p>
                    <p>口座番号 (Nº Conta): <strong className="text-gray-700">3366435</strong> (普通)</p>
                  </div>
                </div>

                <div className="pt-2 text-xs text-muted-foreground leading-relaxed max-w-md mx-auto text-center">
                  Após o depósito, envie uma foto do comprovante para o WhatsApp: <strong className="text-gray-800">{WHATSAPP}</strong>.
                </div>
              </div>
            )}

            {/* PIX SCREEN — pagamento manual com confirmação por comprovante */}
            {order.paymentMethod === 'pix' && (
              <div className="bg-white rounded-3xl border-2 border-pink-500 p-6 mb-8 shadow-md print:hidden text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-pink-600 font-extrabold text-lg">
                  <Smartphone className="w-6 h-6" />
                  <span>PAGAMENTO VIA PIX</span>
                </div>

                {pixPayload ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 max-w-md mx-auto">
                      Pague <strong>{formatPrice(order.total, order.currency)}</strong> escaneando o QR Code
                      ou usando a chave Copia e Cola abaixo no app do seu banco.
                    </p>

                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 inline-block shadow-sm">
                      <QRCodeSVG value={pixPayload} size={200} includeMargin={true} />
                    </div>

                    <div className="max-w-md mx-auto space-y-2">
                      <p className="text-xs text-gray-500 font-bold uppercase">Chave Copia e Cola:</p>
                      <div className="flex border border-gray-300 rounded-xl overflow-hidden shadow-sm bg-gray-50">
                        <input
                          type="text"
                          readOnly
                          value={pixPayload}
                          className="flex-1 px-3 py-2 text-xs font-mono text-gray-500 bg-transparent select-all outline-none"
                        />
                        <button
                          onClick={copyToClipboard}
                          className="bg-pink-500 hover:bg-pink-600 text-white px-4 flex items-center justify-center gap-1.5 transition-all text-xs font-bold"
                        >
                          <Copy className="w-4 h-4" />
                          {copied ? 'Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>

                    <div className="bg-pink-50 border border-pink-200 rounded-2xl p-4 max-w-md mx-auto space-y-3 text-left">
                      <p className="text-sm font-bold text-pink-700 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        Importante: envie o comprovante
                      </p>
                      <p className="text-xs text-pink-700 leading-relaxed">
                        Depois de pagar, mande o <strong>comprovante</strong> pelo WhatsApp para confirmarmos.
                        Seu pedido fica <strong>Aguardando Pagamento</strong> até a confirmação — aí preparamos o envio.
                      </p>
                      <a
                        href={whatsappComprovante}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-3 rounded-xl transition-all"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Enviar comprovante no WhatsApp
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6 max-w-md mx-auto space-y-2">
                    <AlertCircle className="w-8 h-8 text-yellow-600 mx-auto" />
                    <p className="text-sm font-bold text-yellow-800">Chave PIX ainda não configurada</p>
                    <p className="text-xs text-yellow-700 leading-relaxed">
                      A loja ainda não cadastrou a chave PIX. Entre em contato pelo WhatsApp
                      <strong> {WHATSAPP}</strong> para combinar o pagamento do pedido <strong>{order.id}</strong>.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* CREDIT CARD — pagamento já confirmado pelo Stripe antes de chegar nesta tela */}
            {order.paymentMethod === 'card' && (
              <div className="bg-white rounded-3xl border-2 border-pink-500 p-6 mb-8 shadow-md print:hidden space-y-4">
                <div className="flex items-center gap-2 text-pink-600 font-extrabold text-lg justify-center">
                  <CreditCard className="w-6 h-6" />
                  <span>PAGAMENTO VIA CARTÃO DE CRÉDITO</span>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white mx-auto">
                    ✓
                  </div>
                  <h3 className="font-sans font-bold text-lg text-green-800">Transação de Cartão Aprovada!</h3>
                  <p className="text-xs text-green-700 max-w-sm mx-auto leading-relaxed">
                    Seu pagamento foi confirmado com sucesso. O pedido foi enviado para separação no centro logístico de Hiroshima.
                  </p>
                  <button
                    onClick={() => navigate('/rastrear')}
                    className="text-xs font-bold text-green-800 underline hover:no-underline"
                  >
                    Acompanhar meu pedido →
                  </button>
                </div>
              </div>
            )}

            {/* BOLETO SCREEN */}
            {order.paymentMethod === 'boleto' && (
              <div className="bg-white rounded-3xl border-2 border-pink-500 p-6 mb-8 shadow-md print:hidden text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-pink-600 font-extrabold text-lg">
                  <FileText className="w-6 h-6" />
                  <span>EMISSÃO DE BOLETO BANCÁRIO</span>
                </div>

                <div className="bg-yellow-50 text-yellow-700 text-xs font-semibold px-4 py-3 rounded-xl inline-flex items-center gap-2 border border-yellow-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Boleto vence em 3 dias úteis. Compensação em até 48 horas após o pagamento.</span>
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
                      toast({ title: "Código copiado!", description: "Linha digitável copiada." });
                    }}
                    variant="outline"
                    className="border-2"
                  >
                    Copiar Código de Barras
                  </Button>
                  <Button 
                    onClick={handlePrint}
                    variant="secondary"
                  >
                    Imprimir Boleto
                  </Button>
                </div>
              </div>
            )}

            {order.paymentMethod === 'wise' && (
              <div className="bg-white rounded-3xl border-2 border-emerald-500 p-6 mb-8 shadow-md print:hidden text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-emerald-600 font-extrabold text-lg">
                  <Wallet className="w-6 h-6" />
                  <span>PAGAMENTO VIA WISE</span>
                </div>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Pague <strong>{formatPrice(order.total, order.currency || 'BRL')}</strong> pelo Wise com câmbio justo. Após pagar, nos envie o comprovante pelo contato informado.
                </p>
                {wiseLink ? (
                  <a
                    href={wiseLink.startsWith('http') ? wiseLink : `https://wise.com/pay/${wiseLink.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl transition-colors"
                  >
                    <ExternalLink className="w-5 h-5" /> Pagar pelo Wise
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Em instantes enviaremos o link de pagamento Wise pelo seu contato.
                  </p>
                )}
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
                <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs md:text-sm">
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
                      className="font-bold text-pink-700 underline hover:no-underline text-base"
                    >
                      Acompanhar meu pedido →
                    </button>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground block">{t('order.logisticStatus')}</span>
                    <span className="bg-pink-600 text-white font-extrabold px-2 py-0.5 rounded text-xs uppercase inline-block mt-1">
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
                      <p className="text-muted-foreground font-mono mt-0.5">CPF: {order.cpf}</p>
                    )}
                    <p className="text-muted-foreground">Tel: {order.phone}</p>
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
                    {order.items.map((item: any, idx: number) => (
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('order.subtotal')}</span>
                    <span className="font-semibold text-gray-800">
                      {formatPrice(order.subtotal, order.currency || 'BRL')}
                    </span>
                  </div>

                  {order.couponDiscount > 0 && (
                    <div className="flex justify-between text-green-600 font-bold">
                      <span>{t('order.couponDiscount')} ({order.couponCode})</span>
                      <span>-{formatPrice(order.couponDiscount, order.currency || 'BRL')}</span>
                    </div>
                  )}

                  {order.currency !== 'JPY' && order.pixDiscount > 0 && (
                    <div className="flex justify-between text-pink-600 font-bold">
                      <span>{t('order.pixDiscount')}</span>
                      <span>-{formatPrice(order.pixDiscount, 'BRL')}</span>
                    </div>
                  )}

                  {order.currency !== 'JPY' && (order.taxAmount > 0 || order.federalTax > 0) && (
                    <div className="bg-pink-50/50 dark:bg-pink-950/10 border border-pink-200/60 rounded-xl p-3 space-y-2 mt-2">
                      <div className="flex justify-between text-xs font-bold text-orange-850 dark:text-pink-300">
                        <span>{t('order.tax.estimate')}</span>
                        <span>{formatPrice(order.taxAmount || (order.federalTax + order.icmsTax), order.currency)}</span>
                      </div>
                      <p className="text-[10px] text-pink-700 dark:text-pink-400 leading-relaxed font-semibold">
                        {t('order.tax.note')}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {order.currency === 'JPY' ? t('order.shipping.local') : t('order.shipping.intl')}
                    </span>
                    <span className="font-semibold text-gray-800">
                      {order.shippingCost === 0 ? t('order.shipping.free') : formatPrice(order.shippingCost, order.currency || 'BRL')}
                    </span>
                  </div>

                  <div className="flex justify-between pt-3 border-t font-black text-base md:text-lg">
                    <span>{t('order.total')}</span>
                    <span className="text-xl text-pink-600">
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
              <div className="relative pl-6 border-l border-pink-300 space-y-4 text-xs text-muted-foreground">

                {order.currency === 'JPY' ? (
                  <>
                    {([
                      { title: t('order.steps.jp1.title'), desc: t('order.steps.jp1.desc'), done: true },
                      { title: t('order.steps.jp2.title'), desc: t('order.steps.jp2.desc'), done: false },
                      { title: t('order.steps.jp3.title'), desc: t('order.steps.jp3.desc'), done: false },
                      { title: t('order.steps.jp4.title'), desc: t('order.steps.jp4.desc'), done: false },
                    ] as const).map((step, i) => (
                      <div key={i} className="relative">
                        <div className={`absolute -left-[30px] top-0 w-4 h-4 ${step.done ? 'bg-pink-500' : 'bg-gray-300'} rounded-full border-2 border-white flex items-center justify-center text-white text-[8px]`}>{step.done ? '✓' : i + 1}</div>
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
                        <div className={`absolute -left-[30px] top-0 w-4 h-4 ${step.done ? 'bg-pink-500' : 'bg-gray-300'} rounded-full border-2 border-white flex items-center justify-center text-white text-[8px]`}>{step.done ? '✓' : i + 1}</div>
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
                        <div className={`absolute -left-[30px] top-0 w-4 h-4 ${step.done ? 'bg-pink-500' : 'bg-gray-300'} rounded-full border-2 border-white flex items-center justify-center text-white text-[8px]`}>{step.done ? '✓' : i + 1}</div>
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
              <h2 className="text-lg font-bold text-foreground">Pedido confirmado!</h2>
              <p className="text-sm text-muted-foreground mt-1">Você comprou como convidado.</p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 mb-5">
              <p className="text-xs font-bold text-foreground mb-3 uppercase tracking-wide">Crie uma conta e aproveite:</p>
              <ul className="space-y-2 text-sm text-foreground">
                <li className="flex items-center gap-2"><span>🎁</span> <span><strong>Pontos de fidelidade</strong> a cada compra</span></li>
                <li className="flex items-center gap-2"><span>📦</span> <span><strong>Histórico</strong> de todos os seus pedidos</span></li>
                <li className="flex items-center gap-2"><span>🚚</span> <span><strong>Rastreamento</strong> do envio em tempo real</span></li>
                <li className="flex items-center gap-2"><span>🎟️</span> <span><strong>Cupons</strong> e promoções exclusivas</span></li>
                <li className="flex items-center gap-2"><span>🤝</span> <span><strong>Negociações</strong> de desconto personalizadas</span></li>
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate('/cadastro')}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors"
              >
                Criar conta grátis agora
              </button>
              <button
                onClick={() => setShowGuestModal(false)}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Continuar sem conta
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default OrderConfirmation;
