import { safeStorage } from '@/utils/storage';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Phone, MapPin, Calendar, Gift, ShoppingBag, Edit2, LogOut, Package, RotateCcw, Cloud, Truck, Tag, Megaphone, ArrowRight, Handshake, CheckCircle2, XCircle, Hourglass, FileText, Bell, BellOff, Trophy } from 'lucide-react';
import { negotiationService } from '@/services/negotiationService';
import type { Negotiation } from '@/types/negotiation';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, UserProfile } from '@/context/UserContext';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/hooks/use-toast';
import { prefectures } from '@/data/prefectures';
import { japanPrefectures } from '@/data/japanPrefectures';
import { useLanguage } from '@/context/LanguageContext';
import { addAddressHints } from '@/utils/romanize';
import { formatPrice } from '@/utils/currency';
import { useProducts } from '@/context/ProductsContext';
import { isValidEmail, isValidPhone, isNonEmpty, maskPhone, isValidCPF, isValidCNPJ, maskCPF, maskCNPJ } from '@/utils/validation';
import { affiliateService, AffiliateRequest } from '@/services/affiliateService';
import { orderService } from '@/services/orderService';
import { reviewService } from '@/services/reviewService';
import ReviewModal from '@/components/products/ReviewModal';
import { Star } from 'lucide-react';
import SocialFollowRewards from '@/components/profile/SocialFollowRewards';
import ReferralCard from '@/components/profile/ReferralCard';
import PromoNotificationsCard from '@/components/profile/PromoNotificationsCard';
import { pushService } from '@/services/pushService';
import { getEmailSubscription, setEmailSubscription } from '@/services/mailService';
import { TIERS, tierProgress } from '@/services/pointsService';
import { recentProductSpendYen } from '@/utils/loyaltySpend';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};

// Cor do troféu por nível. Fica fora do componente para não recriar o objeto a
// cada render; as cores são fixas (metal), não seguem o tema.
const TIER_TROPHY: Record<string, string> = {
  bronze: 'text-amber-700',
  prata: 'text-slate-200',
  ouro: 'text-yellow-300',
};

const Profile: React.FC = () => {
  const {
    user,
    isAuthenticated,
    authReady,
    coupons,
    orders,
    ordersHasMore,
    ordersLoadingMore,
    loadMoreOrders,
    updateProfile,
    logout,
    refreshOrders,
    ordersOffline,
  } = useUser();
  const { t, selectedCountry } = useLanguage();
  const { products } = useProducts();
  const { addToCart, clearCart } = useCart();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState<Partial<UserProfile>>(user || {});

  // Nível de pontos: mesmo gasto e mesmas faixas que a revisão do pedido usa
  // para prometer os pontos, então as duas telas nunca discordam.
  const tierInfo = useMemo(() => tierProgress(recentProductSpendYen(orders)), [orders]);

  // Notificações push (Web Push/VAPID) — estado real da inscrição neste navegador,
  // checado no navegador (não só a flag `pushEnabled` do perfil, que pode ficar
  // desatualizada se o cliente trocar de dispositivo ou limpar os dados do site).
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    pushService.isSubscribed().then(setPushSubscribed);
  }, []);

  const togglePush = async () => {
    if (!user) return;
    setPushBusy(true);
    try {
      if (pushSubscribed) {
        const res = await pushService.unsubscribe();
        if (res.ok) {
          setPushSubscribed(false);
          updateProfile({ pushEnabled: false });
          toast({ title: 'Notificações desativadas', description: 'Você não vai mais receber push neste dispositivo.' });
        } else {
          toast({ title: 'Erro ao desativar', description: res.error, variant: 'destructive' });
        }
      } else {
        const res = await pushService.subscribe({ email: user.email, name: user.name });
        if (res.ok) {
          setPushSubscribed(true);
          updateProfile({ pushEnabled: true });
          toast({ title: '🔔 Notificações ativadas!', description: 'Você vai receber promoções e novidades por push.' });
        } else {
          toast({ title: 'Não foi possível ativar', description: res.error, variant: 'destructive' });
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  // Inscrição de e-mail. O estado verdadeiro é o do servidor (`email_optout`),
  // o mesmo registro que o link "Cancelar inscrição" do rodapé grava — quem
  // cancelou por lá precisa ver "desativado" aqui, e não uma flag do perfil que
  // ninguém consulta na hora de enviar.
  const [emailNews, setEmailNews] = useState(true);
  const [emailNewsBusy, setEmailNewsBusy] = useState(true);
  useEffect(() => {
    if (!isAuthenticated) return;
    getEmailSubscription().then((r) => {
      setEmailNews(r.subscribed);
      setEmailNewsBusy(false);
    });
  }, [isAuthenticated]);

  const toggleEmailNews = async () => {
    const novo = !emailNews;
    setEmailNewsBusy(true);
    const r = await setEmailSubscription(novo);
    setEmailNews(r.subscribed);
    setEmailNewsBusy(false);
    if (!r.ok) {
      toast({ title: 'Não foi possível salvar', description: r.error, variant: 'destructive' });
      return;
    }
    toast({
      title: novo ? '✅ Inscrição ativada' : 'Inscrição cancelada',
      description: novo
        ? 'Você vai receber novidades e promoções por e-mail.'
        : 'Você não vai mais receber e-mail de divulgação. Confirmação de pedido e rastreio continuam chegando.',
    });
  };

  // País do ENDEREÇO (independente do idioma do site). Define qual busca de CEP
  // e qual lista de estados/províncias usar.
  const addressCountry = (editedUser.address as any)?.country || selectedCountry || 'Brasil';
  const EUROPE = ['Portugal', 'França', 'Itália', 'Espanha', 'Alemanha'];
  const isJapanAddress = addressCountry === 'Japão';
  const isBrazilAddress = addressCountry === 'Brasil';
  const isEuropeAddress = EUROPE.includes(addressCountry);
  // Lista de estados/províncias (Japão/Brasil têm lista; Europa é texto livre).
  const addressList = isJapanAddress ? japanPrefectures : prefectures;

  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const handleConfirmReceived = async (orderNumber: string) => {
    if (!user) return;
    setConfirmingOrderId(orderNumber);
    try {
      const confirmed = await orderService.updateOrderStatus(
        orderNumber,
        'delivered',
        { customerConfirmation: true }
      );
      if (!confirmed) throw new Error('Não foi possível confirmar o recebimento.');

      const now = new Date().toISOString();

      const ordersKey = `orders_${user.id}`;
      const rawOrders = JSON.parse(safeStorage.getItem(ordersKey) || '[]');
      const updatedOrders = rawOrders.map((o) =>
        o.orderNumber === orderNumber ? { ...o, status: 'delivered', updatedAt: now } : o
      );
      safeStorage.setItem(ordersKey, JSON.stringify(updatedOrders));

      const users = JSON.parse(safeStorage.getItem('japan-express-users') || '{}');
      Object.keys(users).forEach((email) => {
        (users[email].orders || []).forEach((o, i: number) => {
          if (o.orderNumber === orderNumber) {
            users[email].orders[i].status = 'delivered';
            users[email].orders[i].updatedAt = now;
          }
        });
      });
      safeStorage.setItem('japan-express-users', JSON.stringify(users));

      const sakura = JSON.parse(safeStorage.getItem('sakura_orders') || '[]');
      const updatedSakura = sakura.map((o) =>
        o.orderNumber === orderNumber ? { ...o, status: 'delivered', updatedAt: now } : o
      );
      safeStorage.setItem('sakura_orders', JSON.stringify(updatedSakura));

      refreshOrders();
      toast({ title: '✅ Recebimento confirmado!', description: 'Obrigado por confirmar. Que aproveite!' });
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao confirmar', description, variant: 'destructive' });
    } finally {
      setConfirmingOrderId(null);
    }
  };

  // Avaliação a partir do histórico de pedidos
  const [reviewTarget, setReviewTarget] = useState<{ id: string; name: string } | null>(null);
  const [reviewBump, setReviewBump] = useState(0); // força recálculo de "já avaliou"
  const findProductId = (name: string) => products.find((p) => p.name === name)?.id;

  // Mostra o atalho do painel de afiliado só se a conta for de um influencer
  const [isAffiliate, setIsAffiliate] = useState(false);
  const [affRequest, setAffRequest] = useState<AffiliateRequest | null>(null);
  const [requesting, setRequesting] = useState(false);

  // Negociações do usuário
  // Refresh orders from localStorage on mount so tracking updates from admin are visible
  useEffect(() => { void refreshOrders(); }, []);

  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  useEffect(() => {
    if (!user?.id && !user?.email) return;
    return negotiationService.listenByUser(user.id || user.email || '', setNegotiations);
  }, [user?.id, user?.email]);
  useEffect(() => {
    if (user?.email) {
      affiliateService.getByOwnerEmail(user.email).then((list) => setIsAffiliate(list.length > 0));
      affiliateService.getMyRequest(user.email).then(setAffRequest);
    }
  }, [user?.email]);

  const handleBecomeAffiliate = async () => {
    if (!user?.email) return;
    setRequesting(true);
    const res = await affiliateService.requestAffiliate(user.name || '', user.email);
    setRequesting(false);
    if (res.ok) {
      toast({ title: '✅ Solicitação enviada!', description: 'Nossa equipe vai analisar e te avisar. Obrigado pelo interesse! 🎉' });
      setAffRequest({ email: user.email.toLowerCase(), name: user.name || '', status: 'pending', requestedAt: new Date().toISOString() });
    } else {
      toast({ title: 'Não foi possível enviar', description: res.error, variant: 'destructive' });
    }
  };

  // Função para recomprar um pedido
  const handleReorder = (order: any) => {
    clearCart();
    
    let itemsAdded = 0;
    
    // Adiciona todos os itens do pedido ao carrinho
    order.items.forEach((item: any) => {
      // Busca o produto original pelo nome
      const product = products.find(p => p.name === item.productName);
      
      if (product) {
        addToCart(product, item.size as 'small' | 'large', item.quantity);
        itemsAdded++;
      }
    });
    
    if (itemsAdded > 0) {
      toast({
        title: "Itens adicionados ao carrinho!",
        description: `${itemsAdded} produto(s) do pedido #${order.orderNumber}`,
      });
      
      // Navega para o carrinho
      navigate('/carrinho');
    } else {
      toast({
        title: "Erro ao adicionar itens",
        description: "Alguns produtos podem não estar mais disponíveis",
        variant: "destructive",
      });
    }
  };



  // Redirect if not authenticated (aguarda authReady para evitar flash de login)
  React.useEffect(() => {
    if (authReady && !isAuthenticated) {
      navigate('/cadastro');
    }
  }, [isAuthenticated, authReady, navigate]);

  if (!user) {
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setEditedUser(prev => ({
        ...prev,
        [parent]: {
          ...((prev as UserProfile)[parent as keyof UserProfile] as Record<string, unknown>),
          [child]: value
        }
      }));
    } else {
      let nextValue = value;
      if (name === 'phone') nextValue = maskPhone(value);
      else if (name === 'cpf') nextValue = maskCPF(value);
      else if (name === 'cnpj') nextValue = maskCNPJ(value);
      setEditedUser(prev => ({ ...prev, [name]: nextValue }));
    }
  };

  // Busca automática de endereço por CEP (Japão via zipcloud, Brasil via ViaCEP).
  const handlePostalCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');

    if (isJapanAddress) {
      // CEP japonês: 7 dígitos, formato XXX-XXXX
      const clean = value.slice(0, 7);
      const formatted = clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3, 7)}` : clean;
      setEditedUser(prev => ({ ...prev, address: { ...prev.address, postalCode: formatted } }));

      if (clean.length === 7) {
        try {
          const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${clean}`);
          const data = await response.json();
          if (data.status === 200 && data.results && data.results.length > 0) {
            const result = data.results[0];
            // Casa com a lista JAPONESA de províncias (ex.: 東京都)
            const prefecture = japanPrefectures.find(p => p.nameJa === result.address1);
            const city = addAddressHints(result.address2);
            const neighborhood = result.address3 ? addAddressHints(result.address3) : '';
            const cityDisplay = neighborhood ? `${city} ${neighborhood}` : city;
            setEditedUser(prev => ({
              ...prev,
              address: { ...prev.address, postalCode: formatted, prefecture: prefecture?.name || '', city: cityDisplay },
            }));
            toast({ title: "Endereço encontrado!", description: "Província e cidade preenchidos automaticamente." });
          }
        } catch (error) {
          devError('Erro ao buscar CEP japonês:', error);
        }
      }
    } else if (isEuropeAddress) {
      // Europa: formato livre, sem busca automática (o cliente digita região e cidade).
      setEditedUser(prev => ({ ...prev, address: { ...prev.address, postalCode: e.target.value } }));
    } else {
      // CEP brasileiro: 8 dígitos, formato XXXXX-XXX
      const clean = value.slice(0, 8);
      const formatted = clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5, 8)}` : clean;
      setEditedUser(prev => ({ ...prev, address: { ...prev.address, postalCode: formatted } }));

      if (clean.length === 8) {
        try {
          const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
          const data = await response.json();
          if (response.ok && !data.erro) {
            const addr = data.logradouro ? `${data.logradouro}${data.bairro ? `, Bairro: ${data.bairro}` : ''}` : '';
            setEditedUser(prev => ({
              ...prev,
              address: { ...prev.address, postalCode: formatted, prefecture: data.uf || '', city: data.localidade || '', address: addr || prev.address?.address || '' },
            }));
            toast({ title: "CEP encontrado!", description: `${data.localidade} - ${data.uf}` });
          } else {
            toast({ title: "Erro no CEP", description: "Não foi possível localizar este CEP.", variant: "destructive" });
          }
        } catch (error) {
          devError('Erro ao buscar CEP:', error);
        }
      }
    }
  };

  const handleSaveProfile = () => {
    // Valida antes de salvar
    if (editedUser.name !== undefined && !isNonEmpty(editedUser.name, 2)) {
      toast({ title: 'Nome inválido', description: 'Informe seu nome completo.', variant: 'destructive' });
      return;
    }
    if (editedUser.email !== undefined && !isValidEmail(editedUser.email)) {
      toast({ title: 'E-mail inválido', description: 'Verifique o endereço de e-mail.', variant: 'destructive' });
      return;
    }
    if (editedUser.phone !== undefined && editedUser.phone !== '' && !isValidPhone(editedUser.phone)) {
      toast({ title: 'Telefone inválido', description: 'Use 10 a 11 dígitos.', variant: 'destructive' });
      return;
    }
    // Validação de CPF/CNPJ apenas quando endereço é Brasil
    if (isBrazilAddress) {
      const isPJ = editedUser.personType === 'PJ';
      if (isPJ) {
        if (editedUser.cnpj !== undefined && editedUser.cnpj !== '' && !isValidCNPJ(editedUser.cnpj)) {
          toast({ title: 'CNPJ inválido', description: 'Verifique o número digitado.', variant: 'destructive' });
          return;
        }
      } else {
        if (editedUser.cpf !== undefined && editedUser.cpf !== '' && !isValidCPF(editedUser.cpf)) {
          toast({ title: 'CPF inválido', description: 'Verifique o número digitado.', variant: 'destructive' });
          return;
        }
      }
    }

    const turnedOnMarketing = editedUser.whatsappMarketing && !user.whatsappMarketing;
    // Apenas salva a preferência — NÃO envia/abre WhatsApp Web.
    updateProfile(editedUser);
    setIsEditing(false);
    toast({
      title: "Perfil atualizado!",
      description: turnedOnMarketing
        ? "✅ Você foi inscrito para receber novidades e promoções."
        : "Suas informações foram salvas com sucesso.",
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso.",
    });
  };

  const activeCoupons = coupons.filter(c => !c.isUsed && new Date(c.expiresAt) > new Date());
  const usedCoupons = coupons.filter(c => c.isUsed);
  const expiredCoupons = coupons.filter(c => !c.isUsed && new Date(c.expiresAt) <= new Date());

  return (
    <Layout>
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {t('profile.title')}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t('profile.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* Pontos de Fidelidade */}
            <div className="bg-gradient-to-r from-amber-400 to-pink-500 rounded-2xl p-6 lg:p-8 text-white shadow-elevated">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-white/90">{t('profile.points.title')}</p>
                  <p className="font-display text-5xl font-extrabold mt-1">{user?.points || 0} <span className="text-2xl font-bold">pts</span></p>
                  <p className="text-sm text-white/90 mt-1">{t('profile.points.desc')}</p>
                </div>
                <div className="text-7xl opacity-80">🎁</div>
              </div>
              {/* Níveis de pontos. Mostra ONDE o cliente está e QUANTO falta —
                  a lista de faixas sozinha é abstrata e não responde "e eu?".
                  Fica no cartão dos pontos porque é a resposta para "como eu
                  ganho mais?". */}
              <div className="mt-6 pt-6 border-t border-white/20">
                <p className="text-sm font-semibold uppercase tracking-wide text-white/90 mb-4">{t('profile.points.tiers.title')}</p>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {TIERS.map((nivel) => {
                    const atual = nivel.id === tierInfo.tier.id;
                    const alcancado = tierInfo.spendYen >= nivel.minSpendYen;
                    return (
                      <div
                        key={nivel.id}
                        className={`rounded-xl px-2 py-3 text-center transition ${
                          atual ? 'bg-white/25 ring-2 ring-white/80 shadow-lg' : 'bg-white/10'
                        }`}
                      >
                        <Trophy
                          className={`w-7 h-7 mx-auto ${TIER_TROPHY[nivel.id]} ${alcancado ? '' : 'opacity-40'}`}
                          strokeWidth={2.5}
                        />
                        <p className="text-xs font-bold mt-1.5 capitalize">{t(`profile.points.tiers.name.${nivel.id}`)}</p>
                        <p className="text-[11px] text-white/80">{nivel.multiplier}x</p>
                        <p className="text-[10px] text-white/70 mt-0.5">
                          {nivel.minSpendYen === 0
                            ? t('profile.points.tiers.start')
                            : `${t('profile.points.tiers.goal')} ¥${nivel.minSpendYen.toLocaleString('pt-BR')}`}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-xs text-white/90 mb-1.5">
                    <span>
                      {t('profile.points.tiers.spent')} <strong className="text-sm">¥{tierInfo.spendYen.toLocaleString('pt-BR')}</strong>
                    </span>
                    {tierInfo.next && (
                      <span className="text-white/80">¥{tierInfo.next.minSpendYen.toLocaleString('pt-BR')}</span>
                    )}
                  </div>
                  <div className="h-2.5 rounded-full bg-white/25 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-500"
                      style={{ width: `${tierInfo.percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/95 mt-2 font-medium">
                    {tierInfo.next ? (
                      <>
                        {t('profile.points.tiers.missing')}{' '}
                        <strong>¥{tierInfo.remainingYen.toLocaleString('pt-BR')}</strong>{' '}
                        {t('profile.points.tiers.toReach')}{' '}
                        <strong className="capitalize">{t(`profile.points.tiers.name.${tierInfo.next.id}`)}</strong>{' '}
                        ({tierInfo.next.multiplier}x)
                      </>
                    ) : (
                      t('profile.points.tiers.max')
                    )}
                  </p>
                </div>

                <p className="text-[11px] italic text-white/70 mt-3">{t('profile.points.tiers.window')}</p>
              </div>
            </div>

            <ReferralCard />

            <SocialFollowRewards />

            {/* Personal Information */}
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="font-display text-2xl font-semibold text-foreground">
                    {t('profile.info.title')}
                  </h2>
                </div>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button variant="outline" onClick={() => setIsEditing(false)}>
                        {t('profile.cancel')}
                      </Button>
                      <Button onClick={handleSaveProfile} className="btn-primary">
                        {t('profile.save')}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => setIsEditing(true)}>
                      <Edit2 className="w-4 h-4 mr-2" />
                      {t('profile.edit')}
                    </Button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('profile.field.fullname')}</Label>
                    <Input
                      id="name"
                      name="name"
                      value={editedUser.name || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={editedUser.email || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('profile.field.phone')}</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={editedUser.phone || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2 md:col-span-2">
                    <input
                      id="whatsappMarketing"
                      name="whatsappMarketing"
                      type="checkbox"
                      checked={!!editedUser.whatsappMarketing}
                      onChange={(e) => setEditedUser(prev => ({ ...prev, whatsappMarketing: e.target.checked }))}
                      className="w-4 h-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                    />
                    <Label htmlFor="whatsappMarketing" className="text-sm font-semibold cursor-pointer select-none leading-none">
                      {t('profile.field.whatsapp')}
                    </Label>
                  </div>
                  {/* Documento fiscal — CPF/CNPJ para Brasil, documento genérico para outros países */}
                  {isBrazilAddress && (
                    <>
                      <div className="space-y-2 md:col-span-2">
                        <Label>{t('profile.field.personType')}</Label>
                        <div className="flex gap-3">
                          {(['PF', 'PJ'] as const).map((type) => (
                            <label key={type} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="personType"
                                value={type}
                                checked={(editedUser.personType ?? 'PF') === type}
                                onChange={() => setEditedUser(prev => ({ ...prev, personType: type }))}
                                className="w-4 h-4 text-primary"
                              />
                              <span className="text-sm font-medium">
                                {type === 'PF' ? t('profile.field.personType.pf') : t('profile.field.personType.pj')}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {(editedUser.personType ?? 'PF') === 'PF' ? (
                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor="cpf">{t('profile.field.cpf')}</Label>
                          <Input
                            id="cpf"
                            name="cpf"
                            placeholder="000.000.000-00"
                            value={editedUser.cpf || ''}
                            onChange={handleInputChange}
                            maxLength={14}
                          />
                          <p className="text-xs text-muted-foreground">⚠️ {t('profile.field.cpf.hint')}</p>
                        </div>
                      ) : (
                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor="cnpj">{t('profile.field.cnpj')}</Label>
                          <Input
                            id="cnpj"
                            name="cnpj"
                            placeholder="00.000.000/0000-00"
                            value={editedUser.cnpj || ''}
                            onChange={handleInputChange}
                            maxLength={18}
                          />
                          <p className="text-xs text-muted-foreground">⚠️ {t('profile.field.cnpj.hint')}</p>
                        </div>
                      )}
                    </>
                  )}
                  {!isBrazilAddress && !isJapanAddress && (
                    <div className="space-y-1 md:col-span-2">
                      <Label htmlFor="document">{t('profile.field.document')}</Label>
                      <Input
                        id="document"
                        name="document"
                        placeholder={t('profile.field.document.placeholder')}
                        value={editedUser.document || ''}
                        onChange={handleInputChange}
                      />
                      <p className="text-xs text-muted-foreground">⚠️ {t('profile.field.document.hint')}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="birthdate">{t('profile.field.birthdate')}</Label>
                    <Input
                      id="birthdate"
                      name="birthdate"
                      type="date"
                      value={editedUser.birthdate || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="addressCountry">{t('profile.field.country')}</Label>
                    <select
                      id="addressCountry"
                      value={addressCountry}
                      onChange={(e) => setEditedUser(prev => ({
                        ...prev,
                        // Troca o país e limpa estado/cidade pra evitar mistura de listas.
                        address: { ...prev.address, country: e.target.value, prefecture: '', city: '' } as any,
                      }))}
                      className="w-full p-3 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                    >
                      {['Brasil', 'Japão', 'Portugal', 'França', 'Itália', 'Espanha', 'Alemanha'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="postalCode">{isJapanAddress ? t('profile.field.postal.jp') : isEuropeAddress ? t('profile.field.postal.eu') : t('profile.field.postal')}</Label>
                    <Input
                      id="postalCode"
                      name="address.postalCode"
                      type="text"
                      placeholder={isJapanAddress ? '100-0001' : isEuropeAddress ? '0000-000' : '01001-000'}
                      value={editedUser.address?.postalCode || ''}
                      onChange={handlePostalCodeChange}
                      maxLength={isEuropeAddress ? 12 : isJapanAddress ? 8 : 9}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isEuropeAddress ? t('profile.field.postalHint.eu') : isJapanAddress ? t('profile.field.postalHint.jp') : t('profile.field.postalHint.br')}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prefecture">{isJapanAddress ? t('profile.field.state.jp') : isEuropeAddress ? t('profile.field.state.eu') : t('profile.field.state')}</Label>
                    {isEuropeAddress ? (
                      <Input
                        id="prefecture"
                        name="address.prefecture"
                        value={editedUser.address?.prefecture || ''}
                        onChange={handleInputChange}
                        placeholder="Ex.: Lisboa, Île-de-France..."
                      />
                    ) : (
                      <select
                        id="prefecture"
                        name="address.prefecture"
                        value={editedUser.address?.prefecture || ''}
                        onChange={(e) => {
                          setEditedUser(prev => ({
                            ...prev,
                            address: { ...prev.address, prefecture: e.target.value }
                          }));
                        }}
                        className="w-full p-3 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                      >
                        <option value="">{isJapanAddress ? t('profile.field.state.placeholder.jp') : t('profile.field.state.placeholder.br')}</option>
                        {addressList.map((pref) => (
                          <option key={pref.name} value={pref.name}>
                            {pref.nameJa} ({pref.name})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">{isJapanAddress ? t('profile.field.city.jp') : t('profile.field.city')}</Label>
                    <Input
                      id="city"
                      name="address.city"
                      value={editedUser.address?.city || ''}
                      onChange={handleInputChange}
                      readOnly={isBrazilAddress || isJapanAddress}
                      className={isBrazilAddress || isJapanAddress ? 'bg-secondary/50' : ''}
                      placeholder={isEuropeAddress ? 'Digite a cidade' : undefined}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">{t('profile.field.address')}</Label>
                    <Input
                      id="address"
                      name="address.address"
                      value={editedUser.address?.address || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="building">{t('profile.field.building')}</Label>
                    <Input
                      id="building"
                      name="address.building"
                      value={editedUser.address?.building || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {t('profile.label.name')}
                    </Label>
                    <p className="font-medium text-foreground">{user.name}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Email
                    </Label>
                    <p className="font-medium text-foreground">{user.email}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      {t('profile.field.phone')}
                    </Label>
                    <p className="font-medium text-foreground">{user.phone}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <Megaphone className="w-4 h-4" />
                      {t('profile.label.emailNews')}
                    </Label>
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-medium text-foreground">
                        {emailNews ? t('profile.marketing.on') : t('profile.marketing.off')}
                      </p>
                      <button
                        onClick={toggleEmailNews}
                        disabled={emailNewsBusy}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
                          emailNews
                            ? 'border-red-300 text-red-600 hover:bg-red-50'
                            : 'border-green-300 text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {emailNewsBusy ? 'Aguarde…' : emailNews ? t('profile.marketing.disable') : t('profile.marketing.enable')}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <Cloud className="w-4 h-4" />
                      {t('profile.label.marketing')}
                    </Label>
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-medium text-foreground">
                        {user.whatsappMarketing ? t('profile.marketing.on') : t('profile.marketing.off')}
                      </p>
                      <button
                        onClick={() => {
                          const novo = !user.whatsappMarketing;
                          updateProfile({ whatsappMarketing: novo });
                          toast({
                            title: novo ? '✅ Inscrição ativada' : 'Inscrição cancelada',
                            description: novo
                              ? 'Você vai receber novidades e promoções no WhatsApp.'
                              : 'Você não vai mais receber novidades no WhatsApp.',
                          });
                        }}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                          user.whatsappMarketing
                            ? 'border-red-300 text-red-600 hover:bg-red-50'
                            : 'border-green-300 text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {user.whatsappMarketing ? t('profile.marketing.disable') : t('profile.marketing.enable')}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      Notificações Push
                    </Label>
                    {pushService.isSupported() ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="font-medium text-foreground">
                          {pushSubscribed ? 'Ativadas neste dispositivo' : 'Desativadas'}
                        </p>
                        <button
                          onClick={togglePush}
                          disabled={pushBusy}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
                            pushSubscribed
                              ? 'border-red-300 text-red-600 hover:bg-red-50'
                              : 'border-green-300 text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {pushBusy ? 'Aguarde…' : pushSubscribed ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <BellOff className="w-3.5 h-3.5" /> Não suportado neste navegador
                      </p>
                    )}
                  </div>
                  {user.birthdate && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {t('profile.field.birthdate')}
                      </Label>
                      <p className="font-medium text-foreground">
                        {new Date(user.birthdate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  )}
                  <div className="space-y-2 md:col-span-2">
                    {/* Documento fiscal no modo visualização */}
                    {isBrazilAddress && (user.cpf || user.cnpj) && (
                      <div className="space-y-1">
                        <Label className="text-muted-foreground text-xs">
                          {user.personType === 'PJ' ? t('profile.field.cnpj') : t('profile.field.cpf')}
                        </Label>
                        <p className="font-medium text-foreground font-mono">
                          {user.personType === 'PJ' ? user.cnpj : user.cpf}
                        </p>
                      </div>
                    )}
                    {!isBrazilAddress && !isJapanAddress && user.document && (
                      <div className="space-y-1">
                        <Label className="text-muted-foreground text-xs">{t('profile.field.document')}</Label>
                        <p className="font-medium text-foreground font-mono">{user.document}</p>
                      </div>
                    )}
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {t('profile.field.address')}
                    </Label>
                    <p className="font-medium text-foreground">
                      〒{user.address.postalCode}<br />
                      {(() => {
                        const pref = prefectures.find(p => p.name === user.address.prefecture);
                        return pref ? `${pref.nameJa} (${pref.name})` : user.address.prefecture;
                      })()} {user.address.city}<br />
                      {user.address.address}
                      {user.address.building && <><br />{user.address.building}</>}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Painel de Afiliado (só para influencers) */}
            {isAffiliate && (
              <Link
                to="/afiliado"
                className="block bg-gradient-to-r from-primary/10 to-primary/5 rounded-2xl border border-primary/30 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
                      <Megaphone className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold text-foreground">{t('profile.affiliate.panel')}</h2>
                      <p className="text-sm text-muted-foreground">{t('profile.affiliate.panel.desc')}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-primary flex-shrink-0" />
                </div>
              </Link>
            )}

            {/* Tornar afiliado (quando ainda não é) */}
            {!isAffiliate && (
              <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl border border-primary/30 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <Megaphone className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-bold text-foreground">{t('profile.affiliate.become')}</h2>
                    <p className="text-sm text-muted-foreground">{t('profile.affiliate.become.desc')}</p>
                  </div>
                </div>
                {affRequest?.status === 'pending' ? (
                  <p className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {t('profile.affiliate.pending')}
                  </p>
                ) : affRequest?.status === 'rejected' ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{t('profile.affiliate.rejected')}</p>
                    <Button onClick={handleBecomeAffiliate} disabled={requesting} className="btn-primary gap-2">
                      <Megaphone className="w-4 h-4" /> {t('profile.affiliate.requestAgain')}
                    </Button>
                  </div>
                ) : (
                  <Button onClick={handleBecomeAffiliate} disabled={requesting} className="btn-primary gap-2">
                    <Megaphone className="w-4 h-4" /> {requesting ? t('profile.affiliate.requesting') : t('profile.affiliate.request')}
                  </Button>
                )}
              </div>
            )}

            {/* Notificações & Promoções (campanhas enviadas pelo admin) */}
            <PromoNotificationsCard />

            {/* Coupons */}
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-primary" />
                </div>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  {t('profile.coupons.title')}
                </h2>
              </div>

              {activeCoupons.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground mb-3">{t('profile.coupons.active')}</h3>
                  {activeCoupons.map((coupon) => (
                    <div 
                      key={coupon.id}
                      className="p-4 rounded-xl border-2 border-dashed border-primary bg-primary/5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-lg text-primary font-mono">{coupon.code}</p>
                          <p className="text-sm text-foreground">{coupon.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('profile.coupons.validUntil')} {new Date(coupon.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-2xl text-primary">
                            {coupon.discountType === 'percentage' ? `${coupon.discount}%` : `¥${coupon.discount}`}
                          </p>
                          <p className="text-xs text-muted-foreground">{t('profile.coupons.discount')}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  {t('profile.coupons.none')}
                </p>
              )}

              {(usedCoupons.length > 0 || expiredCoupons.length > 0) && (
                <div className="mt-6 pt-6 border-t border-border">
                  <h3 className="font-semibold text-muted-foreground mb-3 text-sm">
                    {t('profile.coupons.expired')}
                  </h3>
                  <div className="space-y-2">
                    {[...usedCoupons, ...expiredCoupons].map((coupon) => (
                      <div 
                        key={coupon.id}
                        className="p-3 rounded-lg bg-secondary/30 opacity-60"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-mono text-sm">{coupon.code}</p>
                            <p className="text-xs text-muted-foreground">
                              {coupon.isUsed ? t('profile.coupons.used') : t('profile.coupons.expiredLabel')}
                            </p>
                          </div>
                          <p className="text-sm">
                            {coupon.discountType === 'percentage' ? `${coupon.discount}%` : `¥${coupon.discount}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Purchase History */}
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="font-display text-2xl font-semibold text-foreground">
                    {t('profile.orders.title')}
                  </h2>
                </div>
              </div>

              {/* Sem isto, uma falha ao ler os pedidos no servidor deixava a
                  lista vazia sem explicação — e pedido pago sumindo da tela
                  parece pedido perdido. */}
              {ordersOffline && (
                <div className="mb-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200">
                  <p className="font-semibold text-amber-800">Não conseguimos carregar seus pedidos do servidor</p>
                  <p className="text-sm text-amber-700/90 mt-1">
                    O que aparece abaixo está salvo neste navegador e pode estar
                    incompleto ou desatualizado. Seus pedidos <strong>não foram perdidos</strong> —
                    tente recarregar a página em instantes.
                  </p>
                  <button
                    onClick={() => { void refreshOrders(); }}
                    className="mt-3 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {orders.length > 0 ? (
                <div className="space-y-4">
                  {orders.map((order) => {
                    // Pago = admin confirmou (paymentConfirmed) OU status já avançou além de pending.
                    // Se o pedido está em confirmed/packing/shipped/delivered, o pagamento já foi recebido.
                    const advancedStatuses = ['confirmed', 'processing', 'packing', 'shipped', 'delivered'];
                    const isPaid = !!(order as any).paymentConfirmed || advancedStatuses.includes(order.status as string);
                    return (
                    <div
                      key={order.id}
                      className="p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-foreground font-mono">
                            {order.orderNumber}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(order.date).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-foreground">
                            {(order as any).grandTotalYen && (order as any).currency !== 'JPY'
                              ? `${formatPrice(order.totalAmount, (order as any).currency || 'BRL', true)} (¥ ${((order as any).grandTotalYen as number).toLocaleString()})`
                              : formatPrice(order.totalAmount, (order as any).currency || 'JPY')}
                          </p>
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                            order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                            order.status === 'shipped' ? 'bg-blue-100 text-blue-800' :
                            (order.status as string) === 'packing' ? 'bg-pink-100 text-orange-800' :
                            (order.status as string) === 'processing' ? 'bg-pink-100 text-orange-800' :
                            order.status === 'confirmed' ? 'bg-yellow-100 text-yellow-800' :
                            order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {order.status === 'delivered' ? t('profile.orders.status.delivered') :
                             order.status === 'shipped' ? t('profile.orders.status.shipped') :
                             (order.status as string) === 'packing' ? 'Preparando Pacote' :
                             (order.status as string) === 'processing' ? t('profile.orders.status.processing') :
                             order.status === 'confirmed' ? t('profile.orders.status.confirmed') :
                             order.status === 'cancelled' ? t('profile.orders.status.cancelled') : t('profile.orders.status.pending')}
                          </span>
                        </div>
                      </div>

                      {/* Acompanhamento do pedido — sempre visível */}
                      {(() => {
                        const hasTracking = !!(order as any).trackingNumber;
                        const st = order.status as string;
                        const steps = ['Pagamento', 'Preparando', 'Enviado', 'Entregue'];
                        // Estado de cada etapa: 'done' (✓) | 'active' (atual) | 'pending' (futura).
                        // IMPORTANTE: 'Pagamento confirmado' NÃO significa 'Preparando'. No Personal
                        // Shopper, o preparo só começa quando o admin clica 'Preparando' (pode levar
                        // 2-3 dias após o pagamento). Por isso 'confirmed' deixa Preparando como pending.
                        type StepState = 'done' | 'active' | 'pending';
                        const stepStates: StepState[] =
                          st === 'delivered' ? ['done', 'done', 'done', 'done']
                          : st === 'shipped'  ? ['done', 'done', 'done', 'pending']
                          : (st === 'processing' || st === 'packing') ? ['done', 'active', 'pending', 'pending']
                          : st === 'confirmed' ? ['done', 'pending', 'pending', 'pending']  // pago, ainda não preparando
                          : ['active', 'pending', 'pending', 'pending'];  // pending — aguardando pagamento
                        return (
                          <div className="mt-2 p-3 rounded-xl bg-muted/40 border border-border">
                            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                              <Package className="w-3.5 h-3.5" />
                              Acompanhamento do Pedido
                            </p>
                            <div className="flex items-center gap-1 mb-2">
                              {steps.map((label, i) => {
                                const state = stepStates[i];
                                const highlighted = state === 'done' || state === 'active';
                                // Conector preenchido se a PRÓXIMA etapa já começou (done/active)
                                const nextStarted = i < steps.length - 1 && stepStates[i + 1] !== 'pending';
                                return (
                                  <React.Fragment key={i}>
                                    <div className={`flex flex-col items-center ${i === 0 ? 'flex-shrink-0' : 'flex-1'}`}>
                                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${highlighted ? 'bg-primary text-white' : 'bg-muted-foreground/20 text-muted-foreground'}`}>
                                        {state === 'done' ? '✓' : i + 1}
                                      </div>
                                      <span className={`text-[9px] mt-0.5 text-center leading-tight ${highlighted ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{label}</span>
                                    </div>
                                    {i < steps.length - 1 && (
                                      <div className={`flex-1 h-0.5 mb-3.5 ${nextStarted ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                            {!hasTracking && (
                              <p className="text-[11px] text-muted-foreground">
                                {st === 'pending' ? 'Aguardando confirmação do pagamento.'
                                  : st === 'confirmed' ? '✅ Pagamento confirmado! O preparo do seu pedido começa em até 2-3 dias úteis (serviço Personal Shopper).'
                                  : 'Seu pedido está sendo preparado. O código de rastreio aparecerá aqui após o envio.'}
                              </p>
                            )}
                          </div>
                        );
                      })()}

                      {/* Confirmar recebimento — visível quando pedido está enviado */}
                      {order.status === 'shipped' && (
                        <div className="mb-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800 flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-sm font-semibold text-green-800 dark:text-green-200">📦 Produto chegou?</p>
                            <p className="text-xs text-green-700 dark:text-green-400">Confirme o recebimento para encerrar o pedido.</p>
                          </div>
                          <button
                            onClick={() => handleConfirmReceived(order.orderNumber)}
                            disabled={confirmingOrderId === order.orderNumber}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
                          >
                            {confirmingOrderId === order.orderNumber ? 'Confirmando…' : '✅ Confirmar Recebimento'}
                          </button>
                        </div>
                      )}

                      {/* Tracking Info — shown whenever a tracking number exists */}
                      {(order as any).trackingNumber && (() => {
                        const trackingNumber = ((order as any).trackingNumber as string).trim();
                        const savedUrl = (order as any).trackingUrl || '';
                        let carrierRaw = (order as any).carrier || (order as any).shipping?.carrier || '';

                        // Detect carrier from saved URL if not set
                        if (!carrierRaw && savedUrl) {
                          if (savedUrl.includes('kuronekoyamato')) carrierRaw = 'Yamato';
                          else if (savedUrl.includes('sagawa')) carrierRaw = 'Sagawa';
                          else if (savedUrl.includes('japanpost')) carrierRaw = 'Japan Post';
                          else if (savedUrl.includes('fukutsu')) carrierRaw = 'Fukutsu';
                          else if (savedUrl.includes('correios')) carrierRaw = 'Correios';
                        }

                        // Auto-detect from tracking code pattern when carrier still unknown
                        if (!carrierRaw) {
                          const tnUp = trackingNumber.toUpperCase();
                          if (/^[A-Z]{2}\d{9}BR$/.test(tnUp)) carrierRaw = 'Correios';
                          else if (/^[A-Z]{2}\d{9}JP$/.test(tnUp)) carrierRaw = 'Japan Post';
                        }

                        const getCarrierName = (c: string) => {
                          const lc = c.toLowerCase();
                          if (lc.includes('correios')) return 'Correios (Brasil)';
                          if (lc.includes('ems')) return 'EMS / Japan Post';
                          if (lc.includes('yamato') || lc.includes('クロネコ')) return 'Yamato Transport (クロネコヤマト)';
                          if (lc.includes('sagawa') || lc.includes('佐川')) return 'Sagawa Express (佐川急便)';
                          if (lc.includes('japan post') || lc.includes('ゆうパック') || lc.includes('kozutsumi') || lc.includes('post')) return 'Japan Post (日本郵便)';
                          if (lc.includes('fukutsu') || lc.includes('福通')) return 'Fukutsu Express (福山通運)';
                          return c;
                        };

                        const getTrackingUrl = (c: string, tn: string) => {
                          const lc = c.toLowerCase();
                          // Brazilian Correios — handles international EMS codes ending in BR too
                          if (lc.includes('correios') || tn.toUpperCase().endsWith('BR'))
                            return `https://www.linketrack.com/trace?code=${tn}`;
                          if (lc.includes('ems'))
                            return `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${tn}&locale=pt`;
                          if (lc.includes('yamato') || lc.includes('クロネコ'))
                            return `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number00=1&number01=${tn}`;
                          if (lc.includes('sagawa') || lc.includes('佐川'))
                            return `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${tn}`;
                          if (lc.includes('japan post') || lc.includes('kozutsumi') || lc.includes('post') || tn.toUpperCase().endsWith('JP'))
                            return `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${tn}&locale=pt`;
                          if (lc.includes('fukutsu') || lc.includes('福通'))
                            return `https://corp.fukutsu.co.jp/situation/tracking_no_hunt.html?tracking_no=${tn}`;
                          // Unknown carrier — fallback to Correios (most common for Brazil orders)
                          return `https://www.linketrack.com/trace?code=${tn}`;
                        };

                        const carrierName = getCarrierName(carrierRaw);
                        const trackingUrl = getTrackingUrl(carrierRaw, trackingNumber) || savedUrl;
                        
                        return (
                          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-2 mb-1">
                              <Package className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">{t('profile.orders.tracking.title')}</span>
                            </div>
                            <p className="text-sm text-blue-700 dark:text-blue-300 font-mono">
                              {t('profile.orders.tracking.code')}{' '}
                              <a href={trackingUrl} target="_blank" rel="noopener noreferrer"
                                className="underline hover:text-blue-900 font-bold">
                                {trackingNumber}
                              </a>
                            </p>
                            {carrierName && (
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                {t('profile.orders.tracking.carrier')} {carrierName}
                              </p>
                            )}
                            <a
                              href={trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              {t('profile.orders.tracking.btn')}
                            </a>
                          </div>
                        );
                      })()}

                      <div className="space-y-2">
                        {order.items.map((item, idx) => {
                          const pid = findProductId(item.productName);
                          const reviewed = pid && user ? !reviewService.canUserReview(user.id, pid) : false;
                          void reviewBump; // dependência p/ recalcular após avaliar
                          return (
                            <div key={idx} className="flex justify-between items-center gap-2 text-sm">
                              <span className="text-muted-foreground flex-1 min-w-0">
                                {item.productName} ({item.size}) × {item.quantity}
                              </span>
                              {pid && (
                                reviewed ? (
                                  <span className="text-[11px] text-green-600 font-semibold flex items-center gap-1 shrink-0">
                                    <Star className="w-3.5 h-3.5 fill-green-600" /> {t('profile.orders.reviewed')}
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => setReviewTarget({ id: pid, name: item.productName })}
                                    className="text-[11px] font-semibold text-primary border border-primary/30 rounded-full px-2.5 py-1 hover:bg-primary/5 flex items-center gap-1 shrink-0"
                                  >
                                    <Star className="w-3.5 h-3.5" /> {t('profile.orders.review')}
                                  </button>
                                )
                              )}
                              <span className="font-medium shrink-0">{formatPrice(item.price * item.quantity, (order as any).currency || 'JPY')}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Order breakdown: subtotal, coupon, shipping, total */}
                      {(() => {
                        const itemsSubtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
                        const discount = (order as any).couponDiscount || (itemsSubtotal > order.totalAmount ? itemsSubtotal - order.totalAmount : 0);
                        const shippingData = (order as any).shipping;
                        const shippingCost = shippingData?.cost ?? null;
                        const carrierName = shippingData?.carrier || '';
                        const couponCode = (order as any).couponCode || (order as any).appliedCoupon?.code || '';
                        const oc = (order as any).currency || 'JPY';

                        return (
                          <div className="mt-2 pt-2 border-t border-border space-y-1 text-sm">
                            <div className="flex justify-between text-muted-foreground">
                              <span>{t('profile.orders.subtotal')}</span>
                              <span>{formatPrice(itemsSubtotal, oc)}</span>
                            </div>
                            {discount > 0 && (
                              <div className="flex justify-between text-green-600">
                                <span className="flex items-center gap-1">
                                  <Tag className="w-3 h-3" />
                                  {t('profile.orders.coupon')} {couponCode && <span className="font-mono text-xs">({couponCode})</span>}
                                </span>
                                <span>-{formatPrice(discount, oc)}</span>
                              </div>
                            )}
                            {shippingCost != null && (
                              <div className="flex justify-between text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Truck className="w-3 h-3" />
                                  {t('profile.orders.shipping')} {carrierName && <span className="text-xs">({carrierName})</span>}
                                </span>
                                <span>{shippingCost === 0 ? <span className="text-green-600">{t('profile.orders.free')}</span> : formatPrice(shippingCost, oc)}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-semibold pt-1 border-t border-border">
                              <span>{t('profile.orders.total')}</span>
                              <span className="text-primary">
                                {(order as any).grandTotalYen && oc !== 'JPY'
                                  ? `${formatPrice(order.totalAmount, oc, true)} (¥ ${((order as any).grandTotalYen as number).toLocaleString()})`
                                  : formatPrice(order.totalAmount, oc)}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        {/* Payment Status */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Package className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {t('profile.orders.payment')}{' '}
                              {order.paymentMethod === 'pix' ? 'PIX'
                                : order.paymentMethod === 'wise' ? 'Wise'
                                : order.paymentMethod === 'paypay' ? 'PayPay'
                                : order.paymentMethod === 'yucho' ? 'Yucho'
                                : order.paymentMethod === 'card' ? 'Cartão de Crédito'
                                : order.paymentMethod === 'bank' ? t('profile.orders.payment.bank')
                                : order.paymentMethod || 'N/A'}
                            </span>
                            {isPaid ? (
                              <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                                ✅ Pago
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-pink-600 flex items-center gap-1">
                                ⏳ Pendente
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => {
                              const printWindow = window.open('', '', 'width=800,height=600');
                              if (printWindow) {
                                printWindow.document.write(`
                                  <html><head><title>Comprovante ${order.orderNumber}</title></head><body>
                                  <h1>Comprovante de Pedido</h1>
                                  <p><strong>Número:</strong> ${order.orderNumber}</p>
                                  <p><strong>Data:</strong> ${new Date(order.date).toLocaleDateString('pt-BR')}</p>
                                  <p><strong>Total:</strong> ${formatPrice(order.totalAmount, (order as any).currency || 'JPY')}</p>
                                  <p><strong>Status do Pagamento:</strong> ${isPaid ? '✅ Pago' : '⏳ Pendente'}</p>
                                  <button onclick="window.print()">Imprimir</button>
                                  </body></html>
                                `);
                                printWindow.document.close();
                              }
                            }}
                            variant="outline"
                            size="sm"
                            className="gap-2 text-primary hover:bg-primary/10"
                          >
                            <FileText className="w-3 h-3" />
                            Comprovante
                          </Button>
                          <Button
                            onClick={() => handleReorder(order)}
                            variant="outline"
                            size="sm"
                            className="gap-2 text-primary hover:bg-primary/10"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {t('profile.orders.reorder')}
                          </Button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  {ordersHasMore && (
                    <div className="flex justify-center pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void loadMoreOrders()}
                        disabled={ordersLoadingMore}
                      >
                        {ordersLoadingMore ? '...' : t('profile.orders.loadMore')}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                    <ShoppingBag className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground mb-2">
                    {t('profile.orders.none')}
                  </p>
                  <Button
                    className="btn-primary mt-4"
                    onClick={() => navigate('/produtos')}
                  >
                    {t('profile.orders.start')}
                    <ShoppingBag className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </div>

            {/* Negociações */}
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Handshake className="w-5 h-5 text-primary" />
                </div>
                <h2 className="font-display text-2xl font-semibold text-foreground">Negociações</h2>
              </div>
              {negotiations.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-3">
                    <Handshake className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">Nenhuma negociação ainda.</p>
                  <p className="text-xs text-muted-foreground mt-1">Use o botão "Negociar" no checkout para solicitar desconto na taxa ou no frete.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {negotiations.map((neg) => {
                    const isExpiredClient = negotiationService.isExpired(neg);
                    const isPending = neg.status === 'pending' && !isExpiredClient;
                    const isApproved = (neg.status === 'approved' || neg.status === 'auto_approved');
                    const isUsed = neg.status === 'used';
                    const isRejected = neg.status === 'rejected';
                    const isExpired = neg.status === 'expired' || isExpiredClient;
                    const borderClass = isPending
                      ? 'border-pink-200 bg-pink-50/30 dark:bg-pink-950/10'
                      : isApproved
                      ? 'border-green-200 bg-green-50/30 dark:bg-green-950/10'
                      : isUsed
                      ? 'border-blue-200 bg-blue-50/30 dark:bg-blue-950/10'
                      : isExpired
                      ? 'border-gray-200 opacity-60'
                      : 'border-red-200 bg-red-50/20 dark:bg-red-950/10';
                    return (
                      <div key={neg.id} className={`rounded-xl border p-4 ${borderClass}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-semibold text-sm text-foreground">
                                {neg.type === 'ps_fee' ? '🤝 Taxa Personal Shopper' : '🚚 Frete'}
                              </span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                                isPending ? 'bg-pink-100 text-pink-700 border-pink-300'
                                : isApproved ? 'bg-green-100 text-green-700 border-green-300'
                                : isUsed ? 'bg-blue-100 text-blue-700 border-blue-300'
                                : 'bg-red-100 text-red-700 border-red-300'
                              }`}>
                                {isPending && <><Hourglass className="w-3 h-3" /> Aguardando</>}
                                {isApproved && <><CheckCircle2 className="w-3 h-3" /> Aprovado</>}
                                {isUsed && <><CheckCircle2 className="w-3 h-3" /> Finalizado</>}
                                {isRejected && <><XCircle className="w-3 h-3" /> Recusado</>}
                                {isExpired && <><XCircle className="w-3 h-3" /> Expirado</>}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Desconto pedido: ¥{neg.requestedDiscountYen.toLocaleString()} em ¥{neg.originalAmountYen.toLocaleString()}
                            </p>
                            {(isApproved || isUsed) && neg.approvedDiscountYen != null && (
                              <p className={`text-xs font-semibold mt-1 ${isUsed ? 'text-blue-600' : 'text-green-600'}`}>
                                ✅ Desconto aprovado: ¥{neg.approvedDiscountYen.toLocaleString()} — Valor final: ¥{(neg.originalAmountYen - neg.approvedDiscountYen).toLocaleString()}
                              </p>
                            )}
                            {neg.adminNote && (
                              <p className="text-xs text-muted-foreground mt-1 italic">"{neg.adminNote}"</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {new Date(neg.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                          {isApproved && (
                            <button
                              onClick={() => {
                                negotiationService.markSeen(neg.id);
                                navigate('/checkout', { state: { activeNegId: neg.id } });
                              }}
                              className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
                            >
                              Continuar pedido
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Logout Button */}
            <div className="flex justify-center pt-6">
              <Button 
                variant="outline" 
                onClick={handleLogout}
                className="text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t('profile.logout')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {reviewTarget && (
        <ReviewModal
          productId={reviewTarget.id}
          productName={reviewTarget.name}
          onClose={() => setReviewTarget(null)}
          onDone={() => setReviewBump((n) => n + 1)}
        />
      )}
    </Layout>
  );
};

export default Profile;
