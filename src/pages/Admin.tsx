import { safeStorage } from '@/utils/storage';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Printer, ShoppingBag, User, MapPin, Phone, Mail, Calendar, TestTube, Tag, Truck, CheckCircle, XCircle, Trash2, BarChart3, Users, PackagePlus, Video, Megaphone, Clapperboard, Building2, Sparkles, ShieldCheck, Calculator, CloudUpload, FileText, Handshake, Flag, TrendingDown, MessageCircle, Trophy, Store } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useUser } from '@/context/UserContext';
import { emailService } from '@/services/emailService';
import { emailServiceSimple } from '@/services/emailServiceSimple';
import { whatsappService } from '@/services/whatsappService';
import { whatsappServiceSimple } from '@/services/whatsappServiceSimple';
import { waServer } from '@/services/waServerService';
import { useToast } from '@/hooks/use-toast';
import CouponManager from '@/components/admin/CouponManager';
import AffiliateManager from '@/components/admin/AffiliateManager';
import Dashboard from '@/components/admin/Dashboard';
import CustomerList from '@/components/admin/CustomerList';
import ProductManager from '@/components/admin/ProductManager';
import HomeContentManager from '@/components/admin/HomeContentManager';
import VlogManager from '@/components/admin/VlogManager';
import CustomRequestManager from '@/components/admin/CustomRequestManager';
import B2BRequestManager from '@/components/admin/B2BRequestManager';
import AdminAccessManager from '@/components/admin/AdminAccessManager';
import VideoReviewManager from '@/components/admin/VideoReviewManager';
import ImageMigration from '@/components/admin/ImageMigration';
import PromotionManager from '@/components/admin/PromotionManager';
import NegotiationManager from '@/components/admin/NegotiationManager';
import TrackingModal from '@/components/admin/TrackingModal';
import AdminCalculator from '@/components/admin/AdminCalculator';
import MarketingManager from '@/components/admin/MarketingManager';
import EmployeeManager from '@/components/admin/EmployeeManager';
import CouponUsageReport from '@/components/admin/CouponUsageReport';
import FraudDashboard from '@/components/admin/FraudDashboard';
import ThermalPrinterSettings from '@/components/admin/ThermalPrinterSettings';
import WhatsAppSettings from '@/components/admin/WhatsAppSettings';
import VisitorStats from '@/components/admin/VisitorStats';
import ReviewModeration from '@/components/admin/ReviewModeration';
import MarginAudit from '@/components/admin/MarginAudit';
import CN23Modal from '@/components/admin/CN23Modal';
import PromoNotificationModal from '@/components/admin/PromoNotificationModal';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { orderService } from '@/services/orderService';
import type { OrderPageCursor } from '@/services/firebaseSyncService';
import { customRequestService } from '@/services/customRequestService';
import SorteioManager from '@/components/admin/SorteioManager';
import { customerService } from '@/services/customerService';
import { requireAdminPassword } from '@/utils/adminGuard';
import { negotiationService } from '@/services/negotiationService';
import { convertYen } from '@/services/fxService';
import { formatPrice } from '@/utils/currency';
import { COMPANY_PROFILE } from '@/config/companyProfile';
import { ADMIN_EMAIL } from '@/config/admin';
import { auth } from '@/config/firebase';
import { ADMIN_HEADER_ACTIONS_ENABLED } from '@/config/featureFlags';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


type AdminTab =
  | 'orders' | 'coupons' | 'dashboard' | 'customers' | 'products'
  | 'home' | 'vlog' | 'sorteio' | 'affiliates' | 'requests' | 'b2b' | 'admins' | 'videos'
  | 'calculator' | 'migration' | 'promotion' | 'negotiations' | 'marketing' | 'employees' | 'coupon-usage' | 'fraud'
  | 'thermal-printer' | 'whatsapp' | 'review-moderation' | 'margin-audit' | 'visitors';

interface AdminTabItem {
  id: AdminTab;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: number;
}

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { user, permissions, authReady } = useUser();
  const { toast } = useToast();
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersCursor, setOrdersCursor] = useState<OrderPageCursor | null>(null);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false);
  const [customerCount, setCustomerCount] = useState(0);
  const [newCustomers, setNewCustomers] = useState(0);
  const [newRequests, setNewRequests] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [cn23Order, setCn23Order] = useState<any | null>(null);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [pendingNegotiationsCount, setPendingNegotiationsCount] = useState(0);
  // Sem sessão no Firebase (expirada, ou nunca aberta neste navegador): nenhuma
  // leitura protegida vai passar até entrar de novo.
  const [noAdminSession, setNoAdminSession] = useState(false);
  const { settings, saveSettings } = useSiteSettings();

  // A lista cresce em páginas reais do Firestore; nenhum carregamento integral é feito no navegador.

  // `ADMIN_EMAIL` (de @/config/admin) é só o destinatário do e-mail de teste
  // desta tela. Quem barra o acesso é o guarda de sessão mais abaixo somado às
  // regras do Firestore — o comentário antigo dizia que era esta constante, o
  // que fazia parecer que apagá-la abriria o painel.

  useEffect(() => {
    // Espera o SDK resolver o estado inicial antes de qualquer leitura. Pedidos
    // e contagem de clientes exigem token de admin nas regras do Firestore:
    // disparados antes da sessão existir voltam permission-denied — e ninguém
    // refaz a consulta sozinho depois.
    if (!authReady) return;
    if (!auth?.currentUser) {
      setNoAdminSession(true);
      setOrdersLoading(false);
      return;
    }
    setNoAdminSession(false);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRefresh = 0;
    const MIN_INTERVAL_MS = 10_000; // no mínimo 10s entre refreshes
    // 30s com o painel aberto custava ~40 mil leituras/hora e esgotava sozinho
    // a cota diária do Firestore em pouco mais de UMA HORA — foi o que
    // derrubou a loja em 26/07/2026. O painel não precisa de tempo real:
    // trocar de aba já dispara um refresh pelo `visibilitychange`.
    const POLL_MS = 5 * 60 * 1000;

    const refresh = () => {
      const now = Date.now();
      if (now - lastRefresh < MIN_INTERVAL_MS) return; // throttle
      lastRefresh = now;
      loadOrders();
      loadCustomers();
      loadCustomRequests();
    };

    const debouncedRefresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refresh, 300);
    };

    refresh();

    // Só consulta com a aba à vista. Antes o intervalo seguia disparando em
    // segundo plano: uma aba esquecida queimava a cota sem ninguém olhando.
    const pollVisivel = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    const interval = setInterval(pollVisivel, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') debouncedRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', debouncedRefresh);

    return () => {
      clearInterval(interval);
      clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', debouncedRefresh);
    };
  }, [user, navigate, authReady]);

  useEffect(() => {
    // `onSnapshot` sem sessão erra na primeira resposta e não se reinscreve:
    // o contador de negociações ficaria zerado o resto da sessão.
    if (!authReady || !auth?.currentUser) return;
    // Só as pendentes: o sino precisa do número, não da coleção inteira.
    return negotiationService.listenPending((pendentes) => {
      setPendingNegotiationsCount(pendentes.length);
    });
  }, [authReady]);

  const loadOrders = async (append = false) => {
    if (append && (!ordersHasMore || ordersLoadingMore)) return;

    append ? setOrdersLoadingMore(true) : setOrdersLoading(true);
    try {
      const page = await orderService.getOrdersPage(20, append ? ordersCursor : null);
      setAllOrders((current) => {
        if (!append) return page.items;
        const known = new Set(current.map((order) => order.orderNumber || order.id));
        return [...current, ...page.items.filter((order) => !known.has(order.orderNumber || order.id))];
      });
      setOrdersCursor(page.nextCursor);
      setOrdersHasMore(page.hasMore);
    } catch (error) {
      devError('[ADMIN] Falha ao carregar pedidos:', error);
      if (!append) {
        setAllOrders([]);
        setOrdersCursor(null);
        setOrdersHasMore(false);
      }
      toast({
        title: 'Erro ao carregar pedidos',
        description: auth?.currentUser
          ? 'Não foi possível consultar o Firestore. Tente novamente.'
          : 'Sua sessão de admin não está ativa. Entre novamente para ver os pedidos.',
        variant: 'destructive',
      });
    } finally {
      append ? setOrdersLoadingMore(false) : setOrdersLoading(false);
    }
  };

  // Só o número aparece aqui (contador + badge de novos). Buscar a lista
  // completa para depois usar `.length` custava a leitura das coleções `users`
  // e `orders` inteiras a cada ciclo; a agregação custa ~1 leitura.
  const loadCustomers = async () => {
    try {
      const total = await customerService.getCustomerCount();
      setCustomerCount(total);
      const seenRaw = safeStorage.getItem('admin_seen_customers');
      const seen = seenRaw == null ? null : parseInt(seenRaw, 10);
      if (seen == null || isNaN(seen)) {
        safeStorage.setItem('admin_seen_customers', String(total)); // 1ª vez: sem badge
        setNewCustomers(0);
      } else {
        setNewCustomers(Math.max(0, total - seen));
      }
    } catch (e) {
      devWarn('[admin] contagem de clientes falhou:', e);
    }
  };

  // Pedidos personalizados a processar. O próprio `status` já é o controle, e é
  // ele que o badge conta — não um "visto" guardado no storage.
  //
  // Um badge por "visto" tem exatamente a falha que motivou este pedido: na
  // PRIMEIRA carga ele grava visto = pendentes e mostra zero, escondendo o
  // trabalho que já estava parado (o dono tinha 2 pedidos sem resposta e o
  // painel não indicava nada). O mesmo acontece toda vez que o storage é
  // limpo, ou em outro navegador. Contando `status === 'new'`, o badge só
  // apaga quando o pedido vira 'quoted'/'closed' — ou seja, quando alguém de
  // fato tratou dele.
  const loadCustomRequests = async () => {
    try {
      setNewRequests(await customRequestService.getPendingCount());
    } catch (e) {
      devWarn('[admin] contagem de pedidos personalizados falhou:', e);
    }
  };

  // Pedidos a processar (= novos): tudo que não foi enviado/entregue/cancelado.
  // Robusto a variações de status ('pending', 'Pendente', 'paid', 'processing'...).
  const DONE_STATUSES = ['shipped', 'delivered', 'cancelled', 'enviado', 'entregue', 'cancelado'];
  const pendingOrdersCount = allOrders.filter(
    (o) => !DONE_STATUSES.includes(String(o.status || 'pending').toLowerCase())
  ).length;

  // Ao abrir a aba Clientes, marca todos como vistos (zera o badge)
  useEffect(() => {
    if (activeTab === 'customers' && customerCount > 0) {
      safeStorage.setItem('admin_seen_customers', String(customerCount));
      setNewCustomers(0);
    }
  }, [activeTab, customerCount]);

  const handleConfirmPayment = async (orderNumber: string) => {
    if (!user?.email) {
      toast({ title: "Erro", description: "Email do admin não encontrado", variant: "destructive" });
      return;
    }
    // Confirma pagamento E muda status para 'confirmed' (etapa 1)
    const success = await orderService.confirmPayment(orderNumber, user.email);
    if (success) {
      toast({
        title: "✅ Pagamento confirmado!",
        description: `Pedido ${orderNumber} marcado como pago e pronto para processar.`,
      });
      // Avisa o cliente que o pagamento foi confirmado (preparo em 2-3 dias)
      const order = allOrders.find(o => o.orderNumber === orderNumber);
      if (order) void notifyWhatsApp(order, 'paymentConfirmed');
      loadOrders();
    } else {
      toast({
        title: "Erro",
        description: "Não foi possível confirmar o pagamento",
        variant: "destructive",
      });
    }
  };

  const handleUpdateStatus = async (orderNumber: string, newStatus: 'pending' | 'processing' | 'packing' | 'shipped' | 'delivered' | 'cancelled') => {
    const success = await orderService.updateOrderStatus(orderNumber, newStatus);

    if (success) {
      toast({
        title: "Status atualizado!",
        description: `Pedido ${orderNumber} marcado como ${getStatusLabel(newStatus)}`,
      });
      // Notifica o cliente por WhatsApp ao iniciar o preparo do pacote.
      if (newStatus === 'packing') {
        const order = allOrders.find(o => o.orderNumber === orderNumber);
        if (order) void notifyWhatsApp(order, 'preparing');
      }
      loadOrders();
    } else {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status",
        variant: "destructive",
      });
    }
  };

  // Envia notificação WhatsApp ao cliente (silencioso; mostra toast com o resultado).
  const notifyWhatsApp = async (
    order: any,
    type: 'paymentConfirmed' | 'preparing' | 'shipped',
    extra?: { trackingNumber: string; trackingUrl: string; carrier: string }
  ) => {
    if (!waServer.getConfig().enabled) return;
    const result =
      type === 'paymentConfirmed' ? await waServer.notifyPaymentConfirmed(order)
      : type === 'preparing' ? await waServer.notifyPreparing(order)
      : await waServer.notifyShipped(order, extra!.trackingNumber, extra!.trackingUrl, extra!.carrier);
    if (result.ok) {
      toast({ title: '📱 WhatsApp enviado!', description: `Cliente notificado (${type}).` });
    } else {
      toast({ title: '⚠️ WhatsApp não enviado', description: result.error || 'Erro desconhecido', variant: 'destructive' });
    }
  };

  const handleDeleteOrder = async (orderNumber: string) => {
    if (!permissions.canDelete) {
      toast({ title: 'Sem permissão', description: 'Seu nível de admin não permite excluir. (Nível 2+)', variant: 'destructive' });
      return;
    }
    if (!confirm(`Tem certeza que deseja excluir o pedido ${orderNumber}?`)) {
      return;
    }
    if (!(await requireAdminPassword(`excluir o pedido ${orderNumber}`))) return;

    const success = await orderService.deleteOrder(orderNumber);
    
    if (success) {
      toast({
        title: "Pedido excluído",
        description: `Pedido ${orderNumber} foi removido`,
      });
      loadOrders();
    } else {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o pedido",
        variant: "destructive",
      });
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Aguardando Pagamento',
      processing: 'Pago / Preparando',
      packing: 'Preparando Pacote',
      shipped: 'Enviado',
      delivered: 'Entregue',
      cancelled: 'Cancelado',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      packing: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      shipped: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Test notification services
  const testNotifications = async () => {
    setIsTesting(true);
    devLog('🧪 Starting notification tests...');
    
    try {
      // Test Email
      devLog('📧 Testing email service...');
      
      let emailResult = false;
      
      // Try Resend first
      if (import.meta.env.VITE_RESEND_API_KEY) {
        devLog('📧 Testing Resend...');
        const testEmailHTML = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
            </head>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
              <h1 style="color: #22c55e;">🧪 Test Email (Resend)</h1>
              <p>This is a test email from NikkeyBox!</p>
              <p>If you received this, your email configuration is working correctly! ✅</p>
              <p>Time: ${new Date().toLocaleString('pt-BR')}</p>
            </body>
          </html>
        `;
        
        emailResult = await emailService.sendOrderConfirmation({
          to: ADMIN_EMAIL,
          subject: '🧪 Test Email (Resend) - NikkeyBox',
          html: testEmailHTML,
          orderNumber: 'TEST-' + Date.now(),
          customerName: 'Test User'
        });
      } else {
        // Try EmailJS
        devLog('📧 Testing EmailJS...');
        emailResult = await emailServiceSimple.sendOrderConfirmation({
          formData: {
            name: 'Test User',
            email: ADMIN_EMAIL,
            phone: COMPANY_PROFILE.whatsapp.domestic,
            postalCode: COMPANY_PROFILE.fulfillmentOrigin.postalCode,
            prefecture: COMPANY_PROFILE.fulfillmentOrigin.prefecture,
            city: COMPANY_PROFILE.fulfillmentOrigin.city,
            address: COMPANY_PROFILE.fulfillmentOrigin.addressLine1,
            building: ''
          },
          items: [],
          totalPrice: 1000,
          orderNumber: 'TEST-' + Date.now(),
          paymentMethod: 'bank'
        });
      }
      
      devLog('📧 Email test result:', emailResult);
      
      // Wait a bit before WhatsApp test
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test WhatsApp
      devLog('📱 Testing WhatsApp service...');
      const testMessage = `
🧪 *Test Message*

This is a test message from NikkeyBox!

If you received this, your WhatsApp configuration is working correctly! ✅

Time: ${new Date().toLocaleString('pt-BR')}

_This is an automated test message_
      `.trim();
      
      let whatsappResult = false;
      
      // Try Twilio first
      if (import.meta.env.VITE_TWILIO_ACCOUNT_SID && import.meta.env.VITE_TWILIO_AUTH_TOKEN) {
        devLog('📱 Testing Twilio...');
        whatsappResult = await whatsappService.sendMessage({
          // `whatsapp.digits` = 81 + 7013671679. O literal antigo era
          // `+8107013671679`: carregava o zero do DDD japonês, que o formato
          // internacional não tem. Número com dígito a mais não entrega.
          to: `+${COMPANY_PROFILE.whatsapp.digits}`,
          message: testMessage
        });
      } else {
        // Use simple WhatsApp (always works)
        devLog('📱 Testing Simple WhatsApp (opens directly)...');
        whatsappServiceSimple.sendMessage({
          to: COMPANY_PROFILE.whatsapp.digits,
          message: testMessage
        });
        whatsappResult = true; // It opened, so consider it a success
      }
      
      devLog('📱 WhatsApp test result:', whatsappResult);
      
      toast({
        title: "🧪 Testes Concluídos!",
        description: `Email: ${emailResult ? '✅ Enviado' : '⚠️ Abriu cliente'} | WhatsApp: ${whatsappResult ? '✅ Abriu' : '⚠️ Verifique'}`,
      });
      
    } catch (error) {
      devError('❌ Test error:', error);
      toast({
        title: "❌ Erro nos Testes",
        description: "Verifique o console (F12) para mais detalhes",
        variant: "destructive"
      });
    } finally {
      setIsTesting(false);
    }
  };

  const printOrder = (order: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const statusLabel: Record<string, string> = {
      pending: '⏳ Pendente',
      processing: '✅ Pagamento Confirmado',
      packing: '📦 Preparando Pacote',
      shipped: '🚚 Enviado',
      delivered: '🎉 Entregue',
      cancelled: '❌ Cancelado',
    };

    const paymentLabel: Record<string, string> = {
      pix: '📱 PIX',
      card: '💳 Cartão de Crédito',
      boleto: '📄 Boleto Bancário',
      wise: '💸 Wise (Transferência)',
      paypal: '🅿️ PayPal',
      yucho: '🏦 Banco Yucho',
    };

    const itemsSubtotal = order.items.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
    const discount = order.couponDiscount || (itemsSubtotal > order.totalPrice ? itemsSubtotal - order.totalPrice : 0);
    const shippingCostYen = order.shipping?.cost ?? null;
    const orderCurrency = order.currency || 'BRL';
    const shippingCostDisplay = shippingCostYen != null
      ? (shippingCostYen === 0 ? 'Grátis' : formatPrice(convertYen(shippingCostYen, orderCurrency), orderCurrency))
      : 'N/A';
    const grandTotal = order.totalPrice ?? order.total ?? 0;
    const grandTotalYen = (order as any).grandTotalYen || (order as any).totalYen;

    const itemsHtml = order.items.map((item: any) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${item.productName || item.name}${item.size ? ` <span style="color:#888;font-size:12px;">(${item.size})</span>` : ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatPrice(item.price * item.quantity, orderCurrency)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Pedido ${order.orderNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 14px; color: #111; background: #fff; padding: 24px; }
    .no-print { margin-bottom: 16px; }
    @media print { .no-print { display: none; } body { padding: 0; } }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #e4003a; padding-bottom: 14px; margin-bottom: 18px; }
    .logo { font-size: 22px; font-weight: 900; color: #e4003a; }
    .logo span { color: #111; }
    .order-id { font-size: 18px; font-weight: bold; }
    .order-date { font-size: 12px; color: #666; margin-top: 4px; }
    .status-badge { display: inline-block; background: #fef3c7; color: #92400e; font-weight: bold; font-size: 12px; padding: 3px 10px; border-radius: 20px; margin-top: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .section { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
    .section h3 { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #555; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    .section p { font-size: 13px; margin: 4px 0; line-height: 1.5; }
    .section p.label { color: #888; font-size: 11px; margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th { background: #f9fafb; text-align: left; padding: 6px 8px; font-size: 12px; color: #666; }
    th:last-child, td:last-child { text-align: right; }
    th:nth-child(2), td:nth-child(2) { text-align: center; }
    .totals { margin-top: 4px; }
    .totals tr td { padding: 4px 8px; font-size: 13px; }
    .totals tr.grand td { font-weight: bold; font-size: 15px; border-top: 2px solid #111; padding-top: 8px; }
    .totals tr.discount td { color: #16a34a; }
    .footer { margin-top: 24px; border-top: 1px dashed #ccc; padding-top: 14px; text-align: center; font-size: 11px; color: #aaa; }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#e4003a;color:#fff;border:none;border-radius:6px;margin-right:8px;">🖨️ Imprimir</button>
    <button onclick="window.close()" style="padding:8px 16px;font-size:14px;cursor:pointer;border:1px solid #ccc;border-radius:6px;">✕ Fechar</button>
  </div>

  <div class="header">
    <div>
      <div class="logo">🌸 Japan <span>Express</span></div>
      <div style="font-size:11px;color:#888;margin-top:2px;">Importação Direta Japão-Brasil</div>
    </div>
    <div style="text-align:right;">
      <div class="order-id">Pedido: ${order.orderNumber || 'N/A'}</div>
      <div class="order-date">${new Date(order.orderDate || order.date || Date.now()).toLocaleString('pt-BR')}</div>
      <div class="status-badge">${statusLabel[order.status] || order.status}</div>
    </div>
  </div>

  <div class="grid">
    <div class="section">
      <h3>👤 Cliente</h3>
      <p><strong>${order.shippingAddress?.name || order.customerName || 'N/A'}</strong></p>
      <p class="label">E-mail</p>
      <p>${order.customerEmail || 'N/A'}</p>
      <p class="label">Telefone</p>
      <p>${order.shippingAddress?.phone || order.phone || 'N/A'}</p>
      ${order.cpf ? `<p class="label">CPF</p><p>${order.cpf}</p>` : ''}
    </div>
    <div class="section">
      <h3>📍 Endereço de Entrega</h3>
      <p>〒 ${order.shippingAddress?.postalCode || 'N/A'}</p>
      <p>${order.shippingAddress?.prefecture || ''} ${order.shippingAddress?.city || ''}</p>
      <p>${order.shippingAddress?.address || ''}</p>
      ${order.shippingAddress?.building ? `<p>${order.shippingAddress.building}</p>` : ''}
    </div>
  </div>

  <div class="section" style="margin-bottom:20px;">
    <h3>📦 Itens do Pedido</h3>
    <table>
      <thead>
        <tr>
          <th>Produto</th>
          <th>Qtd</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    <table class="totals">
      <tr>
        <td>Subtotal</td>
        <td></td>
        <td>${formatPrice(itemsSubtotal, orderCurrency)}</td>
      </tr>
      ${discount > 0 ? `<tr class="discount"><td>Cupom ${order.couponCode ? `(${order.couponCode})` : ''}</td><td></td><td>-R$ ${discount.toFixed(2)}</td></tr>` : ''}
      <tr>
        <td>Frete ${order.shippingCarrier ? `(${order.shippingCarrier})` : ''}</td>
        <td></td>
        <td>${shippingCostDisplay}</td>
      </tr>
      ${(order.federalTax > 0 || order.icmsTax > 0 || order.taxAmount > 0) ? `<tr><td style="color:#888;font-size:12px;">Impostos (II + ICMS)</td><td></td><td style="color:#888;font-size:12px;">${formatPrice(Number(order.federalTax && order.icmsTax ? (order.federalTax + order.icmsTax) : order.taxAmount || 0), orderCurrency)}</td></tr>` : ''}
      <tr class="grand">
        <td>Total Geral</td>
        <td></td>
        <td style="color:#e4003a;">${grandTotalYen ? `R$ ${grandTotal.toFixed(2)} (¥ ${Number(grandTotalYen).toLocaleString()})` : formatPrice(grandTotal, orderCurrency)}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h3>💳 Pagamento</h3>
    <p>${paymentLabel[order.paymentMethod] || order.paymentMethod || 'N/A'}</p>
    <p style="margin-top:6px;">Status: <strong>${statusLabel[order.status] || order.status}</strong></p>
  </div>

  <div class="footer">
    NikkeyBox · www.nikkeybox-store.com · Impresso em ${new Date().toLocaleString('pt-BR')}
  </div>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const printShippingLabel = (order: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiqueta de Envio - ${order.orderNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .label { border: 3px solid #000; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 15px; }
          .section { margin-bottom: 20px; }
          .row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
          .box { border: 2px dashed #666; padding: 15px; }
          h1 { margin: 0 0 5px 0; font-size: 28px; }
          h2 { margin: 0; font-size: 14px; color: #666; }
          h3 { margin: 0 0 10px 0; font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
          p { margin: 5px 0; font-size: 14px; }
          .strong { font-weight: bold; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <button class="no-print" onclick="window.print()" style="padding: 10px 20px; margin-bottom: 20px; font-size: 16px; cursor: pointer;">
          🖨️ Imprimir Etiqueta
        </button>
        
        <div class="label">
          <div class="header">
            <h1>🌸 JAPAN EXPRESS</h1>
            <h2>Importação Direta Japão-Brasil</h2>
            <p class="strong">Pedido: ${order.orderNumber || 'N/A'}</p>
            <p>Data: ${new Date(order.orderDate || order.date).toLocaleDateString('pt-BR')}</p>
          </div>

          <div class="section">
            <h3>📦 PRODUTOS</h3>
            ${order.items.map((item: any) => `
              <p>• ${item.productName} (${item.size}) x${item.quantity} - R$${(item.price * item.quantity).toLocaleString()}</p>
            `).join('')}
            <p class="strong" style="margin-top: 10px;">Total: R$${(order.totalPrice ?? order.totalAmount ?? 0).toLocaleString()}</p>
          </div>

          <div class="row">
            <div class="box">
              <h3>📤 REMETENTE (ご依頼主)</h3>
              <p class="strong">${COMPANY_PROFILE.contactName}</p>
              <p>〒${COMPANY_PROFILE.fulfillmentOrigin.postalCode}</p>
              <p>${COMPANY_PROFILE.fulfillmentOrigin.formattedJa.replace(`〒${COMPANY_PROFILE.fulfillmentOrigin.postalCode} `, '')}</p>
              <p>📞 ${COMPANY_PROFILE.whatsapp.domestic}</p>
            </div>
            
            <div class="box">
              <h3>📥 DESTINATÁRIO (Aduana Brasil)</h3>
              <p class="strong">${order.shippingAddress?.name || order.name || order.customerName || 'N/A'}</p>
              <p>CPF: ${order.cpf || 'N/A'}</p>
              <p>CEP: ${order.shippingAddress?.postalCode || order.postalCode || 'N/A'}</p>
              <p>${order.shippingAddress?.prefecture || order.prefecture || ''} - ${order.shippingAddress?.city || order.city || ''}</p>
              <p>${order.shippingAddress?.address || order.address || ''}</p>
              ${(order.shippingAddress?.building || order.building) ? `<p>Complemento: ${order.shippingAddress?.building || order.building}</p>` : ''}
              <p>📞 ${order.phone || 'N/A'}</p>
            </div>
          </div>

          <div class="section" style="margin-top: 20px;">
            <h3>💳 PAGAMENTO</h3>
            <p>${order.paymentMethod === 'pix' ? '📱 PIX' : order.paymentMethod === 'card' ? '💳 Cartão de Crédito' : '📄 Boleto Bancário'}</p>
            <p class="strong">Status: ${order.status === 'pending' || order.status === 'Pendente' ? '⏳ Pendente' : '✅ Confirmado / Pago'}</p>
          </div>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.close()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
            ❌ Fechar
          </button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Bypassed for demo testing
  if (false) {
    return null;
  }

  // Abas desativadas a pedido — ficam fora do menu lateral, mas o código/rota
  // de cada uma continua no projeto (ver renderização de `activeTab` abaixo)
  // caso precise reativar depois.
  const DISABLED_TAB_IDS = new Set<AdminTab>([
    'affiliates', 'visitors', 'review-moderation', 'videos',
    'home', 'vlog', 'sorteio', 'marketing',
    'calculator', 'migration', 'thermal-printer', 'whatsapp', 'promotion',
  ]);

  // Abas agrupadas (menu lateral) — orientado a dados
  const tabGroupsRaw: { title: string; items: AdminTabItem[] }[] = [
    { title: 'Visão geral', items: [{ id: 'dashboard', label: 'Dashboard', icon: BarChart3 }] },
    { title: 'Vendas', items: [
      { id: 'orders', label: 'Pedidos', icon: Package, badge: ordersHasMore ? undefined : pendingOrdersCount },
      { id: 'negotiations', label: 'Negociações', icon: Handshake, badge: pendingNegotiationsCount || 0 },
      { id: 'customers', label: 'Clientes', icon: Users, badge: newCustomers },
      { id: 'affiliates', label: 'Afiliados', icon: Megaphone },
      { id: 'visitors', label: 'Visitantes', icon: BarChart3 },
    ] },
    { title: 'Catálogo', items: [
      { id: 'products', label: 'Produtos', icon: PackagePlus },
      { id: 'coupons', label: 'Cupons', icon: Tag },
      { id: 'review-moderation', label: 'Moderação Reviews', icon: Flag },
    ] },
    { title: 'Solicitações', items: [
      { id: 'requests', label: 'Personalizados', icon: Sparkles, badge: newRequests },
      { id: 'b2b', label: 'Empresas', icon: Building2 },
      { id: 'videos', label: 'Vídeos de review', icon: Video },
    ] },
    { title: 'Conteúdo', items: [
      { id: 'home', label: 'Início', icon: Video },
      { id: 'vlog', label: 'Vlog', icon: Clapperboard },
      { id: 'sorteio', label: 'Sorteio', icon: Trophy },
    ] },
    { title: 'Financeiro', items: [
      { id: 'marketing', label: 'Gastos Marketing', icon: Megaphone },
      { id: 'employees', label: 'Funcionários', icon: Users },
      { id: 'coupon-usage', label: 'Gastos c/ Cupons', icon: Tag },
      { id: 'fraud', label: 'Anti-Fraude', icon: ShieldCheck },
      { id: 'margin-audit', label: 'Auditoria de Margem', icon: TrendingDown },
    ] },
    { title: 'Ferramentas', items: [
      { id: 'promotion', label: 'Promoção Início', icon: Sparkles },
      { id: 'calculator', label: 'Calculadora', icon: Calculator },
      { id: 'migration', label: 'Migrar Imagens', icon: CloudUpload },
      { id: 'thermal-printer', label: 'Impressora Térmica', icon: Printer },
      { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    ] },
    // Só nível 3 vê o gerenciamento de administradores
    ...(permissions.canManageAdmins
      ? [{ title: 'Configurações', items: [{ id: 'admins' as AdminTab, label: 'Administradores', icon: ShieldCheck }] }]
      : []),
  ];
  const tabGroups = tabGroupsRaw
    .map((g) => ({ ...g, items: g.items.filter((i) => !DISABLED_TAB_IDS.has(i.id)) }))
    .filter((g) => g.items.length > 0);
  const allTabs: AdminTabItem[] = tabGroups.flatMap((g) => g.items);
  const activeLabel = allTabs.find((t) => t.id === activeTab)?.label || '';

  return (
    <Layout>
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
              🔐 Painel Administrativo
            </h1>
            <p className="text-muted-foreground text-lg">
              Gestão de Pedidos - Paula Shiokawa
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate('/produtos')}
              >
                <Store className="w-4 h-4" />
                Ver Loja
              </Button>
            </div>
            {ADMIN_HEADER_ACTIONS_ENABLED && (
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Button
                  variant="outline"
                  className="gap-2 border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                  onClick={() => setPromoModalOpen(true)}
                >
                  <Megaphone className="w-4 h-4" />
                  Disparar Notificação Promocional
                </Button>
                <Button
                  variant="outline"
                  className={`gap-2 ${settings.vlogEnabled ? 'border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950' : 'border-border text-muted-foreground hover:bg-secondary'}`}
                  onClick={() => saveSettings({ ...settings, vlogEnabled: !settings.vlogEnabled })}
                >
                  {settings.vlogEnabled ? '👁 Vlog ATIVO' : '🙈 Vlog OCULTO'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {noAdminSession && (
        <div className="container mx-auto px-4 pt-6">
          <div className="max-w-7xl mx-auto rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-destructive">
              Sua sessão de admin não está ativa. Pedidos, clientes e dashboard só carregam depois de entrar novamente.
            </p>
            <Button variant="destructive" size="sm" onClick={() => navigate('/login')}>
              Entrar novamente
            </Button>
          </div>
        </div>
      )}

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto lg:flex lg:gap-8 lg:items-start">

            {/* MENU LATERAL (desktop) */}
            <aside className="hidden lg:block lg:w-56 shrink-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:rounded-2xl">
              <div className="bg-card rounded-2xl border border-border p-3 space-y-4">
                {tabGroups.map((group) => (
                  <div key={group.title}>
                    <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{group.title}</p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.badge ? (
                              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                                {item.badge > 99 ? '99+' : item.badge}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            {/* COLUNA DE CONTEÚDO */}
            <div className="flex-1 min-w-0 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
              {/* Navegação mobile (scroll horizontal) */}
              <div className="lg:hidden mb-6">
                <nav className="flex overflow-x-auto scrollbar-hide gap-2 pb-1">
                  {allTabs.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {item.label}
                        {item.badge ? (
                          <span className="ml-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </nav>
              </div>
              <h2 className="hidden lg:block font-display text-2xl font-bold text-foreground mb-5">{activeLabel}</h2>

            {/* Content */}
            {activeTab === 'orders' ? (
              <>
            
            {/* Test Button */}
            <div className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-2xl border-2 border-blue-200 dark:border-blue-800 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                    <TestTube className="w-5 h-5" />
                    Testar Notificações
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Envie emails e WhatsApp de teste para verificar se as configurações estão funcionando
                  </p>
                </div>
                <Button 
                  onClick={testNotifications}
                  disabled={isTesting}
                  size="lg"
                  className="ml-4"
                >
                  {isTesting ? '⏳ Testando...' : '🧪 Testar Agora'}
                </Button>
              </div>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-card rounded-2xl border border-border p-6">
                <div className="flex items-center gap-3 mb-2">
                  <ShoppingBag className="w-6 h-6 text-primary" />
                  <h3 className="font-semibold text-lg">Pedidos carregados</h3>
                </div>
                <p className="text-3xl font-bold">{allOrders.length}</p>
              </div>
              
              <div className="bg-card rounded-2xl border border-border p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Package className="w-6 h-6 text-yellow-600" />
                  <h3 className="font-semibold text-lg">Pendentes carregados</h3>
                </div>
                <p className="text-3xl font-bold text-yellow-600">
                  {allOrders.filter(o => o.status === 'pending').length}
                </p>
              </div>
              
              <div className="bg-card rounded-2xl border border-border p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="w-6 h-6 text-green-600" />
                  <h3 className="font-semibold text-lg">Hoje (carregados)</h3>
                </div>
                <p className="text-3xl font-bold text-green-600">
                  {allOrders.filter(o => {
                    const orderDate = new Date(o.orderDate).toDateString();
                    const today = new Date().toDateString();
                    return orderDate === today;
                  }).length}
                </p>
              </div>
            </div>

            {/* Orders List */}
            <div className="space-y-6">
              <h2 className="font-display text-2xl font-bold text-foreground">
                Pedidos Recentes
              </h2>
              
              {ordersLoading ? (
                <div className="bg-card rounded-2xl border border-border p-12 text-center flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <p className="text-muted-foreground">Carregando pedidos...</p>
                </div>
              ) : allOrders.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border p-12 text-center">
                  <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum pedido encontrado</p>
                </div>
              ) : (
                allOrders.map((order, index) => (
                  <div key={order.orderNumber || order.id} className="bg-card rounded-2xl border border-border p-6 hover:shadow-lg transition-shadow">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Package className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold text-lg">
                            Pedido #{order.orderNumber || `ORD-${index + 1}`}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status || 'pending')}`}>
                            {getStatusLabel(order.status || 'pending')}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          <Calendar className="w-4 h-4 inline mr-1" />
                          {new Date(order.orderDate).toLocaleString('pt-BR')}
                        </p>
                        <p className="text-sm text-muted-foreground font-semibold">
                          💳 {order.paymentMethod === 'pix' ? 'PIX'
                            : order.paymentMethod === 'wise' ? 'Wise'
                            : order.paymentMethod === 'paypay' ? 'PayPay'
                            : order.paymentMethod === 'yucho' ? 'Yucho'
                            : order.paymentMethod === 'card' ? 'Cartão de Crédito'
                            : order.paymentMethod === 'boleto' ? 'Boleto Bancário'
                            : order.paymentMethod || 'N/A'}
                        </p>
                      </div>
                      
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Button
                          onClick={() => setCn23Order(order)}
                          variant="outline"
                          className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
                        >
                          <FileText className="w-4 h-4" />
                          CN22/CN23
                        </Button>
                        <Button
                          onClick={() => printOrder(order)}
                          variant="outline"
                          className="gap-2"
                        >
                          <Printer className="w-4 h-4" />
                          Imprimir Pedido
                        </Button>
                        <Button
                          onClick={() => printShippingLabel(order)}
                          variant="outline"
                          className="gap-2"
                        >
                          <Printer className="w-4 h-4" />
                          Etiqueta
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-border">
                      {/* Customer Info */}
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Cliente
                        </h4>
                        <div className="space-y-1 text-sm">
                          <p className="font-medium">{order.shippingAddress?.name || order.customerName || 'N/A'}</p>
                          <p className="text-muted-foreground flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            {order.customerEmail || 'N/A'}
                          </p>
                          <p className="text-muted-foreground flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            {order.shippingAddress?.phone || order.customerName || 'N/A'}
                          </p>
                          <p className="text-muted-foreground flex items-start gap-2 mt-2">
                            <MapPin className="w-4 h-4 mt-0.5" />
                            <span>
                              〒{order.shippingAddress?.postalCode || 'N/A'}<br />
                              {order.shippingAddress?.prefecture} {order.shippingAddress?.city}<br />
                              {order.shippingAddress?.address}
                              {order.shippingAddress?.building && <><br />{order.shippingAddress.building}</>}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Products */}
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                          <ShoppingBag className="w-4 h-4" />
                          Produtos
                        </h4>
                        <div className="space-y-2">
                          {order.items.map((item: any, i: number) => (
                            <div key={i} className="flex justify-between text-sm">
                               <span>{item.productName || item.name} ({item.size}) x{item.quantity}</span>
                               <span className="font-semibold font-mono">{formatPrice(item.price * item.quantity, order.currency || 'BRL')}</span>
                            </div>
                          ))}
                          {(() => {
                            const itemsSubtotal = order.items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
                            // Detect coupon discount: saved field OR inferred from items sum vs totalPrice
                            const discount = order.couponDiscount || (itemsSubtotal > order.totalPrice ? itemsSubtotal - order.totalPrice : 0);
                            const shippingCostYen = order.shipping?.cost ?? null;
                            const cardCurrency = order.currency || 'BRL';
                            return (
                              <div className="pt-2 border-t border-border space-y-1">
                                {/* Subtotal */}
                                <div className="flex justify-between text-sm">
                                  <span>Subtotal</span>
                                  <span className="font-mono">{formatPrice(itemsSubtotal, cardCurrency)}</span>
                                </div>
                                
                                {/* Coupon Discount */}
                                {discount > 0 && (
                                  <div className="flex justify-between text-sm text-green-600 font-bold">
                                    <span className="flex items-center gap-1">
                                      <Tag className="w-3 h-3" />
                                      Cupom {order.couponCode && <span className="font-mono bg-green-100 px-1 rounded text-xs">{order.couponCode}</span>}
                                    </span>
                                    <span className="font-mono">-R$ {discount.toFixed(2)}</span>
                                  </div>
                                )}
                                
                                {/* Shipping */}
                                <div className="flex justify-between text-sm">
                                  <span className="flex items-center gap-1">
                                    <Truck className="w-3 h-3" />
                                    Frete {order.shippingCarrier && <span className="text-muted-foreground text-xs">({order.shippingCarrier})</span>}
                                  </span>
                                  <span className="font-mono">{shippingCostYen != null ? (shippingCostYen === 0 ? <span className="text-green-600">Grátis</span> : formatPrice(convertYen(shippingCostYen, cardCurrency), cardCurrency)) : 'N/A'}</span>
                                </div>

                                {/* Taxa PS */}
                                {Number(order.psFeeYen) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="flex items-center gap-1">
                                      🤝 Taxa PS
                                    </span>
                                    <span className="font-mono">
                                      {formatPrice(convertYen(Number(order.psFeeYen), cardCurrency, true), cardCurrency)}
                                    </span>
                                  </div>
                                )}

                                {/* Impostos */}
                                {(order.federalTax > 0 || order.icmsTax > 0 || order.taxAmount > 0) && (
                                  order.federalTax != null && order.icmsTax != null ? (
                                    <>
                                      <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>II Federal</span>
                                        <span className="font-mono">{formatPrice(Number(order.federalTax), cardCurrency)}</span>
                                      </div>
                                      <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>ICMS (17%)</span>
                                        <span className="font-mono">{formatPrice(Number(order.icmsTax), cardCurrency)}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                      <span>Impostos Estimados (II + ICMS)</span>
                                      <span className="font-mono">{formatPrice(Number(order.taxAmount || 0), cardCurrency)}</span>
                                    </div>
                                  )
                                )}
                                
                                {/* Total */}
                                <div className="flex justify-between font-bold pt-1 border-t border-border text-base">
                                  <span>Total Geral</span>
                                  <span className="text-primary font-mono">
                                    {order.currency !== 'JPY' && ((order as any).grandTotalYen || (order as any).totalYen)
                                      ? `R$ ${(order.totalPrice ?? order.total ?? 0).toFixed(2)} (¥ ${(((order as any).grandTotalYen || (order as any).totalYen) as number).toLocaleString()})`
                                      : formatPrice(order.totalPrice ?? order.total ?? 0, cardCurrency)}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-6 pt-4 border-t border-border flex flex-wrap gap-2">
                      {order.status === 'pending' && (
                        <>
                          <Button
                            onClick={() => handleConfirmPayment(order.orderNumber)}
                            size="sm"
                            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="w-4 h-4" />
                            ✅ Confirmar Pagamento Recebido
                          </Button>
                          <Button
                            onClick={() => handleUpdateStatus(order.orderNumber, 'processing')}
                            size="sm"
                            variant="outline"
                          >
                            <Package className="w-4 h-4 mr-2" />
                            Já Processando
                          </Button>
                        </>
                      )}
                      {(order.status === 'processing' || order.status === 'confirmed') && (
                        <Button
                          onClick={() => handleUpdateStatus(order.orderNumber, 'packing')}
                          size="sm"
                          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                        >
                          <Package className="w-4 h-4" />
                          Preparando Pacote
                        </Button>
                      )}
                      {order.status === 'packing' && (
                        <Button
                          onClick={() => {
                            setSelectedOrder(order);
                            setTrackingModalOpen(true);
                          }}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          <Truck className="w-4 h-4" />
                          Marcar como Enviado
                        </Button>
                      )}
                      {order.status === 'shipped' && (
                        <>
                          <Button
                            onClick={() => handleUpdateStatus(order.orderNumber, 'delivered')}
                            size="sm"
                            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="w-4 h-4" />
                            ✅ Pacote Recebido pelo Admin
                          </Button>
                          <Button
                            onClick={() => handleUpdateStatus(order.orderNumber, 'cancelled')}
                            variant="outline"
                            size="sm"
                            className="gap-2 text-orange-600 hover:text-orange-700"
                          >
                            Cancelar
                          </Button>
                        </>
                      )}
                      {order.status !== 'cancelled' && order.status !== 'delivered' && (
                        <Button
                          onClick={() => handleUpdateStatus(order.orderNumber, 'cancelled')}
                          variant="outline"
                          size="sm"
                          className="gap-2 text-orange-600 hover:text-orange-700"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancelar
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDeleteOrder(order.orderNumber)}
                        variant="destructive"
                        size="sm"
                        className="gap-2 ml-auto"
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                ))
              )}

              {allOrders.length > 0 && ordersHasMore && (
                <div className="flex justify-center pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadOrders(true)}
                    disabled={ordersLoadingMore}
                  >
                    {ordersLoadingMore ? 'Carregando...' : 'Carregar mais pedidos'}
                  </Button>
                </div>
              )}
            </div>
            </>
            ) : activeTab === 'coupons' ? (
              <CouponManager />
            ) : activeTab === 'dashboard' ? (
              <Dashboard />
            ) : activeTab === 'products' ? (
              <ProductManager />
            ) : activeTab === 'home' ? (
              <HomeContentManager />
            ) : activeTab === 'vlog' ? (
              <VlogManager />
            ) : activeTab === 'sorteio' ? (
              <SorteioManager />
            ) : activeTab === 'affiliates' ? (
              <AffiliateManager />
            ) : activeTab === 'requests' ? (
              <CustomRequestManager />
            ) : activeTab === 'b2b' ? (
              <B2BRequestManager />
            ) : activeTab === 'videos' ? (
              <VideoReviewManager />
            ) : activeTab === 'admins' ? (
              <AdminAccessManager />
            ) : activeTab === 'promotion' ? (
              <PromotionManager />
            ) : activeTab === 'calculator' ? (
              <AdminCalculator />
            ) : activeTab === 'migration' ? (
              <ImageMigration />
            ) : activeTab === 'negotiations' ? (
              <NegotiationManager />
            ) : activeTab === 'marketing' ? (
              <MarketingManager />
            ) : activeTab === 'employees' ? (
              <EmployeeManager />
            ) : activeTab === 'coupon-usage' ? (
              <CouponUsageReport />
            ) : activeTab === 'fraud' ? (
              <FraudDashboard />
            ) : activeTab === 'thermal-printer' ? (
              <ThermalPrinterSettings />
            ) : activeTab === 'whatsapp' ? (
              <WhatsAppSettings />
            ) : activeTab === 'visitors' ? (
              <VisitorStats />
            ) : activeTab === 'review-moderation' ? (
              <ReviewModeration />
            ) : activeTab === 'margin-audit' ? (
              <MarginAudit />
            ) : (
              <CustomerList />
            )}
            </div>
          </div>
        </div>
      </section>

      {/* Promo Notification Modal */}
      {promoModalOpen && (
        <PromoNotificationModal onClose={() => setPromoModalOpen(false)} />
      )}

      {/* CN22/CN23 Modal */}
      {cn23Order && (
        <CN23Modal order={cn23Order} onClose={() => setCn23Order(null)} />
      )}

      {/* Tracking Modal */}
      {selectedOrder && (
        <TrackingModal
          order={selectedOrder}
          isOpen={trackingModalOpen}
          onClose={() => {
            setTrackingModalOpen(false);
            setSelectedOrder(null);
          }}
          onSuccess={async (trackingNumber, carrierFromModal) => {
            // Get carrier info from modal (which reads from order.shipping.carrier) or fallback
            const carrier = carrierFromModal || selectedOrder.shipping?.carrier || selectedOrder.carrier || '';
            const getTrackingUrl = (c: string, tn: string) => {
              const lc = c.toLowerCase();
              if (lc.includes('yamato') || lc.includes('クロネコ')) return `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number00=1&number01=${tn}`;
              if (lc.includes('sagawa') || lc.includes('佐川')) return `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${tn}`;
              if (lc.includes('japan post') || lc.includes('ゆうパック') || lc.includes('post')) return `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${tn}&locale=ja`;
              if (lc.includes('fukutsu') || lc.includes('福通')) return `https://corp.fukutsu.co.jp/situation/tracking_no_hunt.html?tracking_no=${tn}`;
              return '';
            };
            const trackingUrl = getTrackingUrl(carrier, trackingNumber);

            // Save tracking info to order (Firestore + safeStorage)
            await orderService.updateOrderTracking(selectedOrder.orderNumber, trackingNumber, trackingUrl, carrier);

            // Update status to shipped (sem disparar o WhatsApp de 'packing' aqui)
            await orderService.updateOrderStatus(selectedOrder.orderNumber, 'shipped');
            loadOrders();
            toast({
              title: "Pedido marcado como enviado!",
              description: `Tracking: ${trackingNumber}`,
            });
            // Notifica o cliente com itens + código de rastreio
            void notifyWhatsApp(selectedOrder, 'shipped', { trackingNumber, trackingUrl, carrier });
          }}
        />
      )}
    </Layout>
  );
};

export default Admin;
