import React, { useState, useEffect } from 'react';
import { X, Mail, Send, Users, CheckCircle, AlertCircle, Loader2, Package, Eye, Filter, Smartphone, Sparkles, Percent, Star, Ticket, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { customerService, CustomerStats } from '@/services/customerService';
import { useProducts } from '@/context/ProductsContext';
import { Product } from '@/types';
import { ActivePromo, PROMO_TYPES } from '@/types/promotion';
import { db } from '@/config/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { authenticatedFetch } from '@/services/authenticatedFetch';
import { promoOffer } from '../../../shared/promo-offer.js';

const STORE_URL = 'https://nikkeybox-store.com';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

type Channel = 'email' | 'app' | 'both';
type GenderFilter = 'todos' | 'masculino' | 'feminino' | 'outro';
type SendResult = { email: string; ok: boolean; channel: 'email' | 'app'; error?: string };
// Mecânica (tipo) da oferta exibida no corpo do e-mail/push.
type PromoMechanic = 'none' | 'discount' | 'bogo' | 'bogo_other' | 'points' | 'coupon';

interface PromoOffer {
  badge: string;        // selo curto: "15% + 15%", "COMPRE 1 GANHE 1", "+100 PONTOS"
  tagline: string;      // de onde vem cada parte do desconto
  description: string;  // frase com nome do produto e o que o link faz
  couponLabel: string;  // nome do cupom que o link aplica ('' quando não há)
}

interface Props { onClose: () => void }

const PromoNotificationModal: React.FC<Props> = ({ onClose }) => {
  // Reaproveita a lista já carregada pelo ProductsContext (mesma fonte da aba "Produtos") em
  // vez de refazer o fetch no Firestore — evita o dropdown aparecer vazio enquanto essa 2ª
  // consulta ainda está em andamento (sem indicador de carregamento próprio).
  const { products: allProducts, loading: productsLoading } = useProducts();
  const products = allProducts.filter(p => !p.hidden);
  const [allCustomers, setAllCustomers] = useState<CustomerStats[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  // Mecânica da promoção (tipo de oferta exibida no corpo do e-mail/push).
  const [mechanic, setMechanic] = useState<PromoMechanic>('discount');
  const [discountPct, setDiscountPct] = useState(15);
  const [giftProductId, setGiftProductId] = useState('');
  const [pointsCount, setPointsCount] = useState(100);
  const [couponCode, setCouponCode] = useState('');
  // Manter o desconto inicial do produto (discountPercent) junto com a promo?
  // Desmarcado (padrão): o carrinho cobra o preço ORIGINAL e só a oferta vale.
  const [keepInitialDiscount, setKeepInitialDiscount] = useState(false);
  // Conflito: produto já é a promoção ativa do site (siteContent/homePromotion).
  const [homePromo, setHomePromo] = useState<ActivePromo | null>(null);
  const [conflictChoice, setConflictChoice] = useState<'cancel' | 'stack'>('stack');

  // Composer
  const [subject, setSubject] = useState('🌸 Oferta Especial - NikkeyBox');
  const [headline, setHeadline] = useState('Oferta imperdível para você!');
  const [extraMsg, setExtraMsg] = useState('Aproveite enquanto durar o estoque. Clique no botão abaixo para garantir o seu.');
  const [ctaLabel, setCtaLabel] = useState('Ver Oferta Agora');

  // Filters
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('todos');
  const [birthdayMonths, setBirthdayMonths] = useState<string[]>([]); // ["01","03"]
  const [channel, setChannel] = useState<Channel>('app');
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  // Push: clientes com inscrição ativa agora (coleção push_subscriptions) — define quem é
  // alcançável pelo canal "app", sem depender de FCM (Web Push puro via VAPID).
  const [pushSubscribedEmails, setPushSubscribedEmails] = useState<Set<string>>(new Set());
  const [pushSubsLoading, setPushSubsLoading] = useState(true);

  // Send state
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);
  const [sent, setSent] = useState(false);
  const [tab, setTab] = useState<'compose' | 'preview'>('compose');

  // Clientes: usa a mesma fonte real (Firestore) da aba "Clientes" — a versão local
  // (customerService.getAllCustomers, só localStorage) só vê quem já passou por ESTE
  // navegador, deixando a lista vazia/incompleta numa sessão de admin nova.
  useEffect(() => {
    let cancelled = false;
    const timeout = new Promise<CustomerStats[]>((resolve) => setTimeout(() => resolve([]), 8000));
    Promise.race([customerService.getAllCustomersAsync(), timeout]).then((list) => {
      if (cancelled) return;
      setAllCustomers(list.filter(c => c.email?.includes('@')));
      setCustomersLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Quem já tem push ativo agora (só o admin lê essa coleção — regra Firestore).
  // Corrida com timeout: sob instabilidade de rede o Firestore pode nunca resolver/rejeitar
  // essa consulta (visto em teste); sem isso a mensagem "Verificando..." travaria para sempre.
  useEffect(() => {
    let cancelled = false;
    const fetchSubs = async () => {
      if (!db) return new Set<string>();
      try {
        const snap = await getDocs(collection(db, 'push_subscriptions'));
        const emails = new Set<string>();
        snap.forEach((d) => {
          const email = d.data().customerEmail;
          if (email) emails.add(String(email).toLowerCase());
        });
        return emails;
      } catch {
        // sem permissão (regra ainda não implantada) ou offline — canal "app" fica sem alcance
        return new Set<string>();
      }
    };
    const timeout = new Promise<Set<string>>((resolve) => setTimeout(() => resolve(new Set()), 6000));
    Promise.race([fetchSubs(), timeout]).then((emails) => {
      if (cancelled) return;
      setPushSubscribedEmails(emails);
      setPushSubsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Promoção ativa do site (siteContent/homePromotion) — para detectar conflito quando o
  // produto selecionado já é a promoção atual da página inicial.
  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, 'siteContent', 'homePromotion'))
      .then(snap => { if (snap.exists()) setHomePromo(snap.data() as ActivePromo); })
      .catch(() => { /* sem permissão/offline — segue sem detecção de conflito */ });
  }, []);

  // Apply filters
  const filtered = allCustomers.filter(c => {
    if (genderFilter !== 'todos' && c.gender !== genderFilter) return false;
    if (birthdayMonths.length > 0) {
      const month = c.birthdate?.slice(5, 7); // "YYYY-MM" → "MM"
      if (!month || !birthdayMonths.includes(month)) return false;
    }
    return true;
  });

  // O filtro grosso (gênero/aniversário, ou o carregamento inicial da lista) reinicia a
  // seleção fina marcando todo mundo que passou nele — o admin desmarca individualmente
  // quem não quer incluir.
  useEffect(() => {
    setSelectedEmails(new Set(filtered.map(c => c.email)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderFilter, birthdayMonths, allCustomers]);

  const toggleCustomer = (email: string) =>
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });

  const targets = filtered.filter(c => selectedEmails.has(c.email));
  const reachableByPush = targets.filter(c => pushSubscribedEmails.has(c.email));

  const toggleMonth = (m: string) =>
    setBirthdayMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const productUrl = selectedProduct ? `${STORE_URL}/produto/${selectedProduct.id}` : STORE_URL;
  const productPrice = selectedProduct
    ? (selectedProduct.variants?.length ? Math.min(...selectedProduct.variants.map(v => v.price)) : selectedProduct.prices.small)
    : null;
  const promoPrice = selectedProduct?.discountPercent && productPrice
    ? Math.round(productPrice * (1 - selectedProduct.discountPercent / 100))
    : null;

  // Produto de presente (mecânica "compre 1 e ganhe outro produto").
  const giftProduct = products.find(p => p.id === giftProductId) || null;
  // Conflito: o produto escolhido já é a promoção ativa do site.
  const conflictActive = !!(homePromo && selectedProduct && homePromo.productId === selectedProduct.id);
  // Desconto que o produto já carrega (campo próprio + eventual promoção do site empilhada).
  const baseDiscount = (() => {
    let d = selectedProduct?.discountPercent ?? 0;
    if (conflictActive && conflictChoice === 'stack' && homePromo?.discountPct) d = Math.max(d, homePromo.discountPct);
    return d;
  })();

  // Preview e envio precisam sair do MESMO gerador: quando eram duas funções, o
  // painel prometia "-30%" e o e-mail dizia "15% de desconto".
  const buildOffer = (): PromoOffer => promoOffer({
    mechanic,
    discountPct,
    keepProductDiscount: keepInitialDiscount,
    points: pointsCount,
    couponCode,
    productName: selectedProduct?.name ?? '',
    productDiscountPercent: baseDiscount,
    giftProductName: giftProduct?.name ?? '',
  });

  const offer = buildOffer();
  // Versão HTML do selo + linha da oferta para o template do e-mail.
  const offerHtml = selectedProduct
    ? `<div style="background:linear-gradient(135deg,#fef3c7,#ede9fe);border:1px solid #fcd34d;border-radius:10px;padding:12px 14px;margin:0 0 14px">
         <div style="font-size:12px;font-weight:800;color:#b45309;letter-spacing:.04em">${offer.badge}</div>
         <div style="font-size:15px;font-weight:700;color:#111;margin-top:2px">${offer.tagline}</div>
         <div style="font-size:13px;color:#4b5563;margin-top:4px;line-height:1.5">${offer.description}</div>
       </div>`
    : '';

  const buildHtml = (name: string, ctaUrl: string = productUrl) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif}
    .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.1)}
    .header{background:linear-gradient(135deg,#e11d48,#9333ea);padding:28px 32px;text-align:center}
    .header h1{color:#fff;margin:0;font-size:24px}
    .header p{color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px}
    .body{padding:32px}
    .product-card{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:0 0 24px}
    .product-img{width:100%;max-height:280px;object-fit:cover;display:block}
    .product-info{padding:20px}
    .product-name{font-size:18px;font-weight:700;color:#111;margin:0 0 6px}
    .product-flavor{font-size:13px;color:#6b7280;margin:0 0 14px}
    .price-row{display:flex;align-items:baseline;gap:10px;margin:0 0 8px}
    .price-promo{font-size:26px;font-weight:800;color:#e11d48}
    .price-original{font-size:16px;color:#9ca3af;text-decoration:line-through}
    .price-normal{font-size:26px;font-weight:800;color:#111}
    .badge-off{background:#fef2f2;color:#e11d48;border:1px solid #fecaca;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;display:inline-block}
    .extra{font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 24px}
    .cta{display:block;background:linear-gradient(135deg,#e11d48,#9333ea);color:#fff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-size:16px;font-weight:700}
    .footer{background:#f9fafb;padding:20px 32px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6}
    .footer a{color:#e11d48;text-decoration:none}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>🌸 NikkeyBox</h1>
      <p>Produtos importados direto do Japão</p>
    </div>
    <div class="body">
      <p style="font-size:17px;color:#111;margin:0 0 20px">Olá, <strong>${name}</strong>! 👋</p>
      <h2 style="font-size:20px;color:#111;margin:0 0 20px">${headline}</h2>
      ${selectedProduct ? `
      <div class="product-card">
        ${selectedProduct.thumbnail || selectedProduct.image
          ? `<img class="product-img" src="${selectedProduct.thumbnail || selectedProduct.image}" alt="${selectedProduct.name}">`
          : `<div style="background:#f9fafb;height:200px;display:flex;align-items:center;justify-content:center;font-size:48px">🛍️</div>`}
        <div class="product-info">
          <div class="product-name">${selectedProduct.name}</div>
          ${selectedProduct.flavor ? `<div class="product-flavor">${selectedProduct.flavor}</div>` : ''}
          ${offerHtml}
          <div class="price-row">
            ${(keepInitialDiscount && promoPrice)
              ? `<span class="price-promo">¥${promoPrice.toLocaleString()}</span><span class="price-original">¥${productPrice?.toLocaleString()}</span>`
              : `<span class="price-normal">¥${productPrice?.toLocaleString()}</span>`}
          </div>
          ${(keepInitialDiscount && selectedProduct.discountPercent) ? `<span class="badge-off">-${selectedProduct.discountPercent}% OFF</span>` : ''}
        </div>
      </div>` : ''}
      <p class="extra">${extraMsg}</p>
      <a class="cta" href="${ctaUrl}">${ctaLabel}</a>
    </div>
    <div class="footer">
      NikkeyBox · <a href="${STORE_URL}">nikkeybox-store.com</a><br>
      <span style="font-size:11px;margin-top:6px;display:inline-block">Você está recebendo este e-mail por estar cadastrado em nossa loja.</span>
    </div>
  </div>
</body>
</html>`;

  const sendPromo = async () => {
    if (targets.length === 0) {
      alert('Selecione ao menos um cliente.');
      return;
    }

    const cancelHomePromotion = conflictActive && conflictChoice === 'cancel';
    if (
      cancelHomePromotion
      && !window.confirm(`Isto vai CANCELAR a promoção atual do site ("${homePromo?.productName ?? ''}") antes de enviar. Continuar?`)
    ) {
      return;
    }

    setSending(true);
    setResults([]);
    try {
      const response = await authenticatedFetch('/api/promo-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign: {
            mechanic,
            productId: selectedProduct?.id || '',
            giftProductId: giftProductId || '',
            couponCode: mechanic === 'coupon' ? couponCode.trim().toUpperCase() : '',
            discountPct: Math.max(1, Math.min(90, discountPct || 0)),
            keepProductDiscount: keepInitialDiscount,
            points: Math.max(1, pointsCount || 0),
            expiresInDays: 30,
          },
          recipients: targets.map((customer) => customer.email),
          channel,
          subject,
          headline,
          extraMessage: extraMsg,
          ctaLabel,
          cancelHomePromotion,
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        results?: SendResult[];
      };
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setResults(data.results || []);
      if (cancelHomePromotion) setHomePromo(null);
      setSent(true);
    } catch (error) {
      setResults([{
        email: '(campanha)',
        ok: false,
        channel: channel === 'app' ? 'app' : 'email',
        error: error instanceof Error ? error.message : String(error),
      }]);
    } finally {
      setSending(false);
    }
  };

  const successCount = results.filter(r => r.ok).length;
  const failCount = results.filter(r => !r.ok).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">Notificação Promocional</h2>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
              {targets.length} destinatário{targets.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab(tab === 'compose' ? 'preview' : 'compose')}
              className="flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-1.5 hover:bg-secondary transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              {tab === 'compose' ? 'Preview' : 'Editar'}
            </button>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-secondary">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'compose' ? (
            <div className="p-5 space-y-5">

              {/* ── FILTROS ─────────────────────────────── */}
              <div className="border border-border rounded-xl p-4 space-y-4 bg-secondary/20">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Filter className="w-4 h-4" /> Filtrar destinatários
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {customersLoading
                      ? 'Carregando clientes…'
                      : <>{allCustomers.length} cadastrados → <span className="text-primary font-semibold">{filtered.length} no filtro</span></>}
                  </span>
                </div>

                {/* Gênero */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">GÊNERO</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'todos', label: 'Todos' },
                      { value: 'feminino', label: '♀ Feminino' },
                      { value: 'masculino', label: '♂ Masculino' },
                      { value: 'outro', label: '— Outro / N/D' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setGenderFilter(opt.value as GenderFilter)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${genderFilter === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-gray-300'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Meses de aniversário */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    MÊS DE ANIVERSÁRIO <span className="font-normal">(vazio = ignorar)</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {MONTHS.map((m, i) => {
                      const val = String(i + 1).padStart(2, '0');
                      const active = birthdayMonths.includes(val);
                      return (
                        <button
                          key={val}
                          onClick={() => toggleMonth(val)}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-gray-300'}`}
                        >
                          {m.slice(0, 3)}
                        </button>
                      );
                    })}
                    {birthdayMonths.length > 0 && (
                      <button onClick={() => setBirthdayMonths([])} className="px-2.5 py-1 rounded-lg border border-red-300 text-red-500 text-xs hover:bg-red-50">
                        Limpar
                      </button>
                    )}
                  </div>
                </div>

                {/* Clientes individuais */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> CLIENTES ({targets.length}/{filtered.length} selecionados)
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelectedEmails(new Set(filtered.map(c => c.email)))} className="text-[11px] font-semibold text-primary hover:underline">
                        Selecionar todos
                      </button>
                      <button type="button" onClick={() => setSelectedEmails(new Set())} className="text-[11px] font-semibold text-muted-foreground hover:underline">
                        Limpar seleção
                      </button>
                    </div>
                  </div>
                  {customersLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando clientes…
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">Nenhum cliente cadastrado corresponde ao filtro.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border bg-background">
                      {filtered.map(c => (
                        <label key={c.email} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-secondary/50">
                          <input
                            type="checkbox"
                            checked={selectedEmails.has(c.email)}
                            onChange={() => toggleCustomer(c.email)}
                            className="w-3.5 h-3.5 rounded border-input text-primary focus:ring-primary shrink-0"
                          />
                          <span className="font-medium truncate max-w-[35%]">{c.name}</span>
                          <span className="text-muted-foreground truncate">{c.email}</span>
                          {pushSubscribedEmails.has(c.email) && (
                            <span className="ml-auto flex items-center gap-0.5 text-[10px] font-semibold text-green-600 shrink-0">
                              <Smartphone className="w-3 h-3" /> push
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Canal */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">CANAL</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'email', label: '✉️ Só por e-mail' },
                      { value: 'app', label: '📲 Só no app' },
                      { value: 'both', label: '✉️📲 E-mail + App' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setChannel(opt.value as Channel)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${channel === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-gray-300'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {(channel === 'app' || channel === 'both') && (
                    pushSubsLoading ? (
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Verificando quem tem push ativo…
                      </p>
                    ) : reachableByPush.length === 0 ? (
                      <p className="text-xs text-amber-600 mt-1.5">
                        ⚠️ Nenhum dos clientes selecionados ativou notificações push ainda (eles ativam em "Meu Perfil").
                        {channel === 'app' ? ' Nada será enviado.' : ' Só o e-mail será enviado.'}
                      </p>
                    ) : (
                      <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                        <Smartphone className="w-3 h-3" /> {reachableByPush.length} de {targets.length} selecionados vão receber push de verdade.
                      </p>
                    )
                  )}
                </div>
              </div>

              {/* ── PRODUTO ─────────────────────────────── */}
              <div>
                <label className="block text-sm font-semibold mb-1 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" /> Produto em destaque
                  <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <select
                  value={selectedProduct?.id || ''}
                  onChange={e => setSelectedProduct(products.find(p => p.id === e.target.value) || null)}
                  disabled={productsLoading && products.length === 0}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                >
                  <option value="">
                    {productsLoading && products.length === 0 ? 'Carregando produtos…' : '— Sem produto específico —'}
                  </option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.discountPercent ? ` 🔥 -${p.discountPercent}%` : ''}
                    </option>
                  ))}
                </select>
                {!productsLoading && products.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Nenhum produto publicado encontrado. Cadastre ou publique um produto na aba "Produtos".</p>
                )}
                {selectedProduct && (
                  <div className="mt-2 flex items-center gap-3 p-2 bg-secondary/50 rounded-lg">
                    {(selectedProduct.thumbnail || selectedProduct.image) && (
                      <img src={selectedProduct.thumbnail || selectedProduct.image} className="w-12 h-12 object-cover rounded-lg shrink-0" alt="" />
                    )}
                    <div className="text-xs">
                      <div className="font-semibold">{selectedProduct.name}</div>
                      <div className="text-muted-foreground">
                        {promoPrice
                          ? <><span className="text-red-600 font-bold">¥{promoPrice.toLocaleString()}</span> <span className="line-through">¥{productPrice?.toLocaleString()}</span> <span className="text-red-600">-{selectedProduct.discountPercent}%</span></>
                          : <span>¥{productPrice?.toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Conflito com a promoção ativa do site */}
              {conflictActive && (
                <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Este produto já está na promoção ativa do site
                    ({homePromo?.discountPct ? `-${homePromo.discountPct}%` : (PROMO_TYPES.find(t => t.value === homePromo?.type)?.label ?? 'promoção')}).
                  </p>
                  <div className="flex flex-col gap-1.5 pl-5">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="radio" checked={conflictChoice === 'cancel'} onChange={() => setConflictChoice('cancel')} className="w-3.5 h-3.5 text-primary" />
                      Cancelar a promoção atual do site e aplicar esta nova
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="radio" checked={conflictChoice === 'stack'} onChange={() => setConflictChoice('stack')} className="w-3.5 h-3.5 text-primary" />
                      Manter a promoção atual{mechanic === 'discount' ? ' e somar o desconto extra abaixo' : ''}
                    </label>
                  </div>
                </div>
              )}

              {/* ── MECÂNICA DA PROMOÇÃO ──────────────────── */}
              <div className="border border-border rounded-xl p-4 space-y-3 bg-secondary/20">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Mecânica da promoção</p>
                <div className="grid sm:grid-cols-2 gap-3 items-center">
                  <select
                    value={mechanic}
                    onChange={e => setMechanic(e.target.value as PromoMechanic)}
                    className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="discount">🏷️ Desconto (%)</option>
                    <option value="bogo">🎁 Compre 1 e Ganhe 1</option>
                    <option value="bogo_other">🎁 Compre 1 e Ganhe outro produto</option>
                    <option value="points">⭐ Compre e Ganhe pontos</option>
                    <option value="coupon">🎟️ Compre e Ganhe um cupom</option>
                    <option value="none">📦 Só destacar o produto</option>
                  </select>
                  {mechanic === 'discount' && (
                    <label className="flex items-center gap-2 text-sm">
                      <Percent className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input type="number" min={1} max={90} value={discountPct}
                        onChange={e => setDiscountPct(Math.max(1, Math.min(90, Number(e.target.value) || 0)))}
                        className="w-24 border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      <span className="text-muted-foreground">% de desconto</span>
                    </label>
                  )}
                  {(selectedProduct?.discountPercent ?? 0) > 0 && (
                    <label className="flex items-start gap-2 text-xs cursor-pointer sm:col-span-2 text-muted-foreground">
                      <input type="checkbox" checked={keepInitialDiscount} onChange={e => setKeepInitialDiscount(e.target.checked)}
                        className="w-3.5 h-3.5 mt-0.5 accent-primary shrink-0" />
                      <span>
                        Manter o desconto inicial do produto (-{selectedProduct?.discountPercent}%) junto com a promoção.
                        {' '}<strong>Desmarcado:</strong> o produto volta ao preço original no carrinho e só a oferta da notificação vale.
                      </span>
                    </label>
                  )}
                  {mechanic === 'bogo_other' && (
                    <select value={giftProductId} onChange={e => setGiftProductId(e.target.value)}
                      className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="">— Produto de presente —</option>
                      {products.filter(p => p.id !== selectedProduct?.id).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                  {mechanic === 'points' && (
                    <label className="flex items-center gap-2 text-sm">
                      <Star className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input type="number" min={1} value={pointsCount}
                        onChange={e => setPointsCount(Math.max(1, Number(e.target.value) || 0))}
                        className="w-28 border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      <span className="text-muted-foreground">pontos</span>
                    </label>
                  )}
                  {mechanic === 'coupon' && (
                    <label className="flex items-center gap-2 text-sm">
                      <Ticket className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="Ex: PROMO10" maxLength={20}
                        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                    </label>
                  )}
                </div>
                <div className="text-xs bg-background border border-border rounded-lg p-2.5">
                  <span className="font-bold text-primary">{offer.badge}</span>
                  {' · '}<span className="font-medium">{offer.tagline}</span>
                  <p className="text-muted-foreground mt-1">{offer.description}</p>
                </div>
              </div>


              {/* ── TEXTO ─────────────────────────────── */}
              <div>
                <label className="block text-sm font-semibold mb-1">Assunto do e-mail</label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Título principal</label>
                <input value={headline} onChange={e => setHeadline(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Texto da oferta</label>
                <textarea value={extraMsg} onChange={e => setExtraMsg(e.target.value)} rows={4}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Texto do botão</label>
                <input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {/* Results */}
              {results.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-secondary px-3 py-2 text-sm font-semibold flex items-center justify-between">
                    <span>{successCount} enviados / {failCount} erro(s)</span>
                    {sent && <span className={successCount > 0 ? 'text-green-600' : 'text-red-600'}>{successCount > 0 ? '✓ Concluído' : '✗ Falhou'}</span>}
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-border">
                    {results.map((r, i) => (
                      <div key={`${r.channel}-${r.email}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        {r.ok ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        {r.channel === 'app' ? <Smartphone className="w-3 h-3 text-muted-foreground shrink-0" /> : <Mail className="w-3 h-3 text-muted-foreground shrink-0" />}
                        <span className="truncate">{r.email}</span>
                        <span className={`ml-auto ${r.ok ? 'text-green-600' : 'text-red-500'}`} title={r.error}>{r.ok ? 'ok' : (r.error || 'erro')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-3 text-center">Preview do e-mail (nome de exemplo: "Maria")</p>
              <div className="border border-border rounded-xl overflow-hidden">
                <iframe srcDoc={buildHtml('Maria')} className="w-full" style={{ height: '560px', border: 'none' }} title="preview" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex gap-3 justify-end shrink-0">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={sendPromo} disabled={sending || sent || targets.length === 0} className="gap-2">
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
              : sent
                ? <><CheckCircle className="w-4 h-4" /> Concluído</>
                : <><Send className="w-4 h-4" /> Enviar para {targets.length} cliente{targets.length !== 1 ? 's' : ''}</>}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PromoNotificationModal;
