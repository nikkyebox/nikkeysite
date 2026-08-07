import React, { useState, useEffect, useRef } from 'react';
import { packedWeightG } from '../../shared/weight.js';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Send, X, Bot, Sparkles, Loader2, MessageSquare, Trash, CornerDownLeft, Command, HelpCircle, Smartphone, ShoppingCart, ChevronRight } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useLanguage } from '@/context/LanguageContext';
import { useUser } from '@/context/UserContext';
import { useProducts } from '@/context/ProductsContext';
import { Product } from '@/types';
import { safeStorage } from '@/utils/storage';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { askQwen, qwenEnabled, QwenMsg, AdminCatalogItem } from '@/services/qwenService';
import { productEnglishName } from '@/utils/productName';
import { effectiveYen } from '@/utils/pricing';
import { catalogShippingYen } from '@/utils/catalogShipping';
import { getELightRate, getAirParcelRate, getEmsRate, countryToZone } from '@/utils/japanPostRates';
import { convertYen as fxConvert } from '@/services/fxService';
import { authenticatedFetch } from '@/services/authenticatedFetch';
import { toast } from 'sonner';
import { COMPANY_PROFILE } from '@/config/companyProfile';

// Formato internacional em toda mensagem: o cliente que lê isto está no Brasil
// e disca de lá. O link `wa.me` usa os dígitos puros, sem `+` nem separador.
const WHATSAPP = COMPANY_PROFILE.whatsapp.international;
const WHATSAPP_LINK = `wa.me/${COMPANY_PROFILE.whatsapp.digits}`;

interface ShippingOption {
  carrier: string;
  basePrice: number;
  ratePerKg: number;
  currency: 'BRL' | 'JPY' | 'EUR';
  daysEstimate?: string;
}

interface Message {
  id: string;
  sender: 'user' | 'kimi';
  text: string;
  timestamp: Date;
  agentSteps?: string[];
  isConsentPrompt?: boolean;
  orderToShare?: any;
  products?: Product[];
  shippingResults?: ShippingOption[];
  shippingCountry?: string;
  shippingWeight?: number;
}

const ClawIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="2" x2="12" y2="7" />
    <rect x="9" y="7" width="6" height="3" rx="1" className="fill-primary/20 stroke-primary" />
    <path d="M9 9c-2.2 0.8-3.5 2.5-2.5 5.5c0.4 1.2 1.2 2 2.5 2" />
    <path d="M15 9c2.2 0.8 3.5 2.5 3 5.5c-0.4 1.2-1.2 2-2.5 2" />
    <circle cx="12" cy="9" r="0.8" className="fill-primary" />
  </svg>
);

// Peso estimado (g) por categoria e variante — usado quando o produto não tem weightGrams.
const WEIGHT_BY_CATEGORY: Record<string, { small: number; large: number }> = {
  doces:      { small: 280, large: 800 },
  cosmeticos: { small: 200, large: 500 },
  papelaria:  { small: 150, large: 400 },
  acessorios: { small: 300, large: 800 },
};
const DEFAULT_WEIGHT = { small: 300, large: 800 };

// Turnos de conversa enviados à IA. 6 estourava rápido: uma recomendação seguida
// de duas perguntas de acompanhamento já empurrava o produto para fora da janela.
const AI_HISTORY_TURNS = 12;

const KimiClawAssistant: React.FC = () => {
  const { addToCart, clearCart } = useCart();
  const { language, setLanguage, t, selectedCountry } = useLanguage();
  const { products } = useProducts();
  const { user, updateProfile } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<string[]>([]);
  const [showAttentionBadge, setShowAttentionBadge] = useState(true);
  const fabButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  // Pedidos cujo consentimento já foi respondido (esconde os botões Sim/Não)
  const [respondedOrders, setRespondedOrders] = useState<string[]>([]);


  // Shipping flow states
  type ShippingStep = 'idle' | 'ask_country' | 'ask_weight';
  const [shippingFlow, setShippingFlow] = useState<ShippingStep>('idle');
  const [shippingData, setShippingData] = useState<{ country?: string; weight?: number }>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Garante que a mensagem de confirmação do pedido é mostrada só UMA vez por pedido
  const promptedOrderRef = useRef<string | null>(null);

  // Admin: adminRole está definido no perfil do usuário quando a sessão é de admin
  const isAdmin = !!user?.adminRole;

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, currentSteps]);

  // Persistência da conversa no navegador — sobrevive à troca de página (igual ao carrinho),
  // evitando que o chat "reinicie" toda vez que o cliente navega entre seções da loja.
  const KIMICLAW_STORAGE_KEY = 'kimiclaw_messages_v1';
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length > 0) return prev; // já há mensagens (ex.: fluxo de pedido confirmado)
      try {
        const saved = safeStorage.getItem(KIMICLAW_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
          }
        }
      } catch { /* storage corrompido — ignora */ }
      return [{ id: 'welcome', sender: 'kimi', text: t('kimiclaw.welcome'), timestamp: new Date() }];
    });
  }, [language, t]);

  // Salva a conversa sempre que muda (mantém só as últimas 50 mensagens p/ não inchar o storage)
  useEffect(() => {
    if (messages.length > 0) {
      try {
        safeStorage.setItem(KIMICLAW_STORAGE_KEY, JSON.stringify(messages.slice(-50)));
      } catch { /* storage cheio/indisponível — ignora */ }
    }
  }, [messages]);

  // ── AUTO-LIMPEZA POR INATIVIDADE (10 minutos) ───────────────────────────
  // Conversas longas acumulam tokens na API (todo o histórico é reenviado a cada msg).
  // Para evitar isso, se não houver interação por 10 min o chat é zerado (memória + storage),
  // voltando à mensagem de boas-vindas. Qualquer atividade reinicia a contagem.
  const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutos
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Zera a conversa por completo (estado + persistência)
  const clearConversation = React.useCallback(() => {
    setMessages([{ id: 'welcome', sender: 'kimi', text: t('kimiclaw.welcome'), timestamp: new Date() }]);
    setRespondedOrders([]);
    setShippingFlow('idle');
    try {
      safeStorage.removeItem(KIMICLAW_STORAGE_KEY);
    } catch { /* ignora */ }
    if (isOpen) {
      toast.info(language === 'ja' ? 'しばらく操作がなかったため、会話をリセットしました 💬' : 'Conversa reiniciada por inatividade 💬');
    }
  }, [t, language, isOpen]);

  // Reinicia o timer a cada atividade: novas mensagens, IA digitando, abrir/fechar, digitar no input
  useEffect(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    // Só ativa o timer se já existir conversa além da boas-vindas
    if (messages.length <= 1) return;
    inactivityTimerRef.current = setTimeout(clearConversation, INACTIVITY_MS);
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [messages, isTyping, isOpen, inputValue, clearConversation]);

  // Hide attention badge when chat is opened; gerencia foco e tecla Escape
  // para acessibilidade por teclado (WCAG 2.1.1 / 2.1.2).
  useEffect(() => {
    if (isOpen) {
      setShowAttentionBadge(false);
      wasOpenRef.current = true;
      panelRef.current?.focus();
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false);
      };
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }
    if (wasOpenRef.current) fabButtonRef.current?.focus();
    wasOpenRef.current = false;
  }, [isOpen]);

  // Listen to order confirmation page lands (mostra a mensagem só uma vez por pedido)
  useEffect(() => {
    if (location.pathname !== '/order-confirmation') return;
    const order = location.state?.order;
    const orderNum = order?.orderNumber || order?.id || '';
    if (!order || !orderNum) return;
    if (promptedOrderRef.current === orderNum) return; // já mostrou para este pedido
    promptedOrderRef.current = orderNum;

    // Compra como convidado: Kimi só confirma o pedido — sem prompt de notificações
    // (convidados não têm conta; o popup de benefícios já é exibido pelo OrderConfirmation)
    const isGuest = !!location.state?.isGuest;

    setIsOpen(true);
    const timer = setTimeout(() => {
      const clientName = order.name || (user ? user.name : 'Cliente');
      const alreadySubscribed = !!user?.whatsappMarketing;

      let confirmationText = '';
      if (isGuest) {
        confirmationText = language === 'ja'
          ? `ご購入ありがとうございます！🎉 ご注文 **${orderNum}** を承りました。`
          : `Pedido **${orderNum}** confirmado! 🎉 Assim que pagar, seu pedido entra em preparo.`;
      } else if (alreadySubscribed) {
        if (language === 'pt') {
          confirmationText = `Parabéns pela sua compra, **${clientName}**! 🎉 Seu pedido **${orderNum}** foi recebido. Você já está inscrito para receber novidades — avisaremos assim que o pedido for enviado! 📦`;
        } else if (language === 'ja') {
          confirmationText = `ご購入ありがとうございます、**${clientName}** 様！🎉 ご注文 **${orderNum}** を承りました。すでに新着情報を受け取る設定になっています 📦`;
        } else {
          confirmationText = `Thank you for your purchase, **${clientName}**! 🎉 Your order **${orderNum}** has been received. You're already subscribed to updates — we'll notify you when it ships! 📦`;
        }
      } else {
        if (language === 'pt') {
          confirmationText = `Parabéns pela sua compra, **${clientName}**! 🎉 Seu pedido **${orderNum}** foi recebido. \n\nQuer receber **novidades e cupons exclusivos**? É só confirmar que eu marco no seu perfil. 🎁`;
        } else if (language === 'ja') {
          confirmationText = `ご購入ありがとうございます、**${clientName}** 様！🎉 ご注文 **${orderNum}** を承りました。\n\n**新着情報と限定クーポン**を受け取りますか？確認するとマイページに登録します。🎁`;
        } else {
          confirmationText = `Thank you for your purchase, **${clientName}**! 🎉 Your order **${orderNum}** has been received.\n\nWant to receive **news and exclusive coupons**? Just confirm and I'll enable it on your profile. 🎁`;
        }
      }

      setMessages(prev => [
        ...prev,
        {
          id: `order-prompt-${orderNum}`,
          sender: 'kimi',
          text: confirmationText,
          timestamp: new Date(),
          isConsentPrompt: !isGuest && !alreadySubscribed,
          orderToShare: (!isGuest && !alreadySubscribed) ? order : undefined
        }
      ]);
    }, 1200);
    return () => clearTimeout(timer);
  }, [location]);

  // Normalize text for search - remove accents and lowercase
  const normalizeText = (text: string): string => {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  };

  // Palavras de ligação/comando ignoradas na busca (pt/en)
  const STOP_WORDS = new Set([
    'por', 'pro', 'pra', 'para', 'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
    'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'com', 'me', 'meu', 'minha',
    'tem', 'ter', 'tinha', 'algum', 'alguma', 'algo', 'quero', 'queria', 'gostaria',
    'mostrar', 'mostra', 'ver', 'buscar', 'procurar', 'pesquisar', 'achar', 'encontrar',
    'voce', 'vc', 'ai', 'existe', 'vende', 'vendem', 'possui', 'teria', 'produto', 'produtos',
    'search', 'find', 'show', 'want', 'the', 'for', 'of', 'an', 'is', 'do', 'you', 'have',
  ]);

  // Quebra a busca em palavras úteis (ignora ligação e palavras curtas)
  const tokenize = (query: string): string[] =>
    normalizeText(query)
      .split(/[\s,.;:!?'"()/_\-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  // Pontua produtos por relevância à query (pontua por palavra → bem mais tolerante).
  // Base reutilizada tanto pela busca determinística (searchProducts) quanto pelo
  // filtro de catálogo relevante mandado pra IA (relevantCatalogForAI) — mesma
  // lógica de match em ambos os casos, sem duplicar.
  const categoryAliases: Record<string, string[]> = {
    'doces': ['doce', 'snack', 'chocolate', 'candy', 'sweet', 'お菓子', 'okashi', 'kitkat', 'kit kat', 'pocky', 'jagariko', 'calbee', 'nestle', 'meiji', 'glico'],
    'cosmeticos': ['cosmetico', 'skincare', 'protetor', 'creme', 'mascara', 'skin', 'lotion', 'コスメ', '化粧品', 'biore', 'hada', 'dhc', 'shiseido'],
    'acessorios': ['acessorio', 'figura', 'boneco', 'figure', 'anime', 'plush', 'アクセサリー', 'グッズ', 'luffy', 'naruto', 'demon', 'pokemon'],
    'papelaria': ['caneta', 'caderno', 'pen', 'notebook', 'paper', 'notepad', '文房具', 'sakura', 'tombow', 'kokuyo', 'pilot', 'zebra'],
  };

  const scoreProducts = (query: string): { product: Product; score: number; strong: number }[] => {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    return products.map((product) => {
      let score = 0;
      let strong = 0; // só nome/id/categoria/marca/sabor (sinal forte de produto)
      const nId = normalizeText(product.id);
      const nName = normalizeText(productEnglishName(product));
      const nDesc = normalizeText(product.description);
      const nFlavor = normalizeText(product.flavor);
      const nCat = normalizeText(product.category);
      const aliases = (categoryAliases[product.category] || []).map((a) => normalizeText(a).replace(/\s+/g, ''));

      tokens.forEach((tok) => {
        const t = tok.replace(/\s+/g, '');
        if (tok.length < 3) return; // ignora tokens curtos ("e", "de", "pix"≥3 ok)
        if (nName.includes(tok)) { score += 5; strong += 5; }
        if (nId.includes(tok)) { score += 5; strong += 5; }
        if (nFlavor.includes(tok)) { score += 3; strong += 3; }
        if (nCat.includes(tok)) { score += 4; strong += 4; }
        if (aliases.some((a) => a.length >= 3 && (a.includes(t) || t.includes(a)))) { score += 4; strong += 4; }
        if (nDesc.includes(tok)) score += 2; // descrição = sinal fraco (não conta como "strong")
      });

      return { product, score, strong };
    }).sort((a, b) => b.score - a.score);
  };

  // Search for products based on query (pontua por palavra → bem mais tolerante)
  const searchProducts = (query: string, opts?: { requireStrong?: boolean }): Product[] =>
    scoreProducts(query)
      .filter((item) => (opts?.requireStrong ? item.strong > 0 : item.score > 0))
      .slice(0, 5)
      .map((item) => item.product);

  // ── FOCO CONVERSACIONAL ───────────────────────────────────────────────────
  // Os skills determinísticos resolvem o produto só pelo texto da pergunta atual.
  // Sem memória, "tenho pele seca" → (recomenda Hada Labo) → "e o frete?" perdia
  // o produto e o bot voltava a perguntar "qual produto?".
  // O foco é DERIVADO do histórico — que já é persistido no localStorage — então
  // sobrevive à troca de página e ao reload sem estado extra para sincronizar.
  const focusRef = useRef<Product[]>([]);
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const shown = messages[i].products;
      if (shown && shown.length > 0) { focusRef.current = shown; return; }
    }
    focusRef.current = [];
  }, [messages]);

  /** Produtos citados na pergunta atual; se ela não citar nenhum, cai no último
   *  que o assistente mostrou. Menção explícita sempre vence o foco. */
  const resolveProducts = (query: string): Product[] => {
    const explicit = searchProducts(query, { requireStrong: true });
    return explicit.length > 0 ? explicit : focusRef.current;
  };

  // Catálogo relevante pra mandar como contexto pra IA — reusa o MESMO scoring da
  // busca determinística, mas com limite maior (contexto da IA, não cards visuais)
  // e SEM exigir score > 0: se a pergunta é genérica/conversacional (sem termo de
  // produto), manda uma amostra ampla do catálogo em vez de nada, senão a IA fica
  // sem contexto nenhum pra responder "o que vocês vendem" etc.
  const relevantCatalogForAI = (query: string, limit = 30): Product[] => {
    const scored = scoreProducts(query);
    const withScore = scored.filter((item) => item.score > 0);
    if (withScore.length > 0) return withScore.slice(0, limit).map((item) => item.product);
    return products.filter((p) => !p.hidden).slice(0, limit);
  };

  // Detecta intenção de navegar por CATEGORIA ("quais doces tem", "me mostra cosméticos")
  const CATEGORY_WORDS: Record<string, string[]> = {
    doces: ['doce', 'doces', 'snack', 'snacks', 'chocolate', 'chocolates', 'guloseima', 'salgadinho', 'candy', 'sweets', 'okashi'],
    cosmeticos: ['cosmetico', 'cosmeticos', 'cosmetic', 'skincare', 'beleza', 'maquiagem', 'creme', 'cremes', 'protetor'],
    acessorios: ['acessorio', 'acessorios', 'figura', 'figuras', 'colecionavel', 'colecionaveis', 'anime', 'figure', 'goods'],
    papelaria: ['papelaria', 'caneta', 'canetas', 'caderno', 'cadernos', 'escritorio', 'stationery'],
  };
  const CATEGORY_LABEL: Record<string, string> = {
    doces: 'doces', cosmeticos: 'cosméticos', acessorios: 'acessórios', papelaria: 'papelaria',
  };
  const detectCategory = (query: string): string | null => {
    const toks = tokenize(query);
    for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
      if (words.some((w) => toks.includes(normalizeText(w)))) return cat;
    }
    return null;
  };
  // Mostra todos os produtos de uma categoria. Retorna true se mostrou algo.
  const showCategory = (cat: string): boolean => {
    const list = products.filter((p) => p.category === cat).slice(0, 8);
    if (list.length === 0) return false;
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        sender: 'kimi',
        text: language === 'pt'
          ? `Aqui estão nossos **${CATEGORY_LABEL[cat]}** (${list.length}):`
          : `Here are our **${cat}** (${list.length}):`,
        timestamp: new Date(),
        products: list,
      },
    ]);
    return true;
  };

  // Frete REAL por país e peso — mesma tabela do Japan Post usada no Checkout,
  // no feed do Google e no orçamento (getELightRate/getAirParcelRate/getEmsRate).
  // Antes esta função inventava fórmula linear (base + R$/kg) com nomes de
  // transportadora que não existem no sistema real ("PAC", "Prioritário") — dava
  // até 5,6x o valor real do frete. Japão doméstico retorna [] de propósito: o
  // preço real depende da província exata de entrega (zona 1-4 de Hiroshima) e
  // essa informação não é coletada aqui — o chamador orienta a usar a calculadora
  // real em vez de mostrar um valor chutado.
  const calculateShipping = (country: string, weightKg: number): ShippingOption[] => {
    const normalizedCountry = normalizeText(country);

    // Detect country from aliases
    let detectedCountry = country;
    if (normalizedCountry.includes('brasil') || normalizedCountry.includes('brazil') || normalizedCountry.includes('br')) detectedCountry = 'Brasil';
    else if (normalizedCountry.includes('japao') || normalizedCountry.includes('japan') || normalizedCountry.includes('ja')) detectedCountry = 'Japão';
    else if (normalizedCountry.includes('portugal') || normalizedCountry.includes('pt')) detectedCountry = 'Portugal';
    else if (normalizedCountry.includes('franca') || normalizedCountry.includes('france') || normalizedCountry.includes('fr')) detectedCountry = 'França';
    else if (normalizedCountry.includes('italia') || normalizedCountry.includes('italy') || normalizedCountry.includes('it')) detectedCountry = 'Itália';
    else if (normalizedCountry.includes('espanha') || normalizedCountry.includes('spain') || normalizedCountry.includes('es')) detectedCountry = 'Espanha';

    if (detectedCountry === 'Japão') return [];

    const zone = countryToZone(detectedCountry);
    const currency: 'BRL' | 'EUR' = ['Portugal', 'França', 'Itália', 'Espanha'].includes(detectedCountry) ? 'EUR' : 'BRL';
    const weightG = Math.max(100, Math.round(weightKg * 1000));
    const daysByZone: Record<number, { light: string; air: string; ems: string }> = {
      1: { light: '6-10', air: '4-7', ems: '2-4' },
      2: { light: '7-12', air: '5-9', ems: '3-5' },
      3: { light: '7-14', air: '6-10', ems: '4-7' },
      4: { light: '7-14', air: '6-10', ems: '3-6' },
      5: { light: '20-40', air: '10-15', ems: '18' },
    };
    const zd = daysByZone[zone] || daysByZone[5];
    const options: ShippingOption[] = [];

    if (weightG <= 2000) {
      const eLightYen = getELightRate(weightG, zone);
      if (eLightYen) {
        options.push({
          carrier: 'Japan Post E-Light (国際eパケットライト)',
          basePrice: Math.round(fxConvert(eLightYen, currency)),
          ratePerKg: 0,
          currency,
          daysEstimate: zd.light,
        });
      }
    } else {
      const airYen = getAirParcelRate(weightG, zone);
      if (airYen) {
        options.push({
          carrier: 'Japan Post Kozutsumi Air (国際小包航空便)',
          basePrice: Math.round(fxConvert(airYen, currency)),
          ratePerKg: 0,
          currency,
          daysEstimate: zd.air,
        });
      }
    }

    const emsYen = getEmsRate(weightG, zone);
    if (emsYen) {
      options.push({
        carrier: 'Japan Post EMS · via DHL',
        basePrice: Math.round(fxConvert(emsYen, currency)),
        ratePerKg: 0,
        currency,
        daysEstimate: zd.ems,
      });
    }

    return options;
  };

  // Atraso da resposta: hoje é 100% lógica local instantânea (sem chamada de IA
  // real desde que qwenEnabled()===false), então o atraso é só ritmo de UX, não
  // espera de rede. Valores reduzidos (eram 1500ms base + 800ms/passo — quase 4s
  // num fluxo de 3 passos) mantêm a animação de "passos do agente" visível sem
  // travar a conversa artificialmente.
  const addKimiMessageWithTyping = async (text: string, agentSteps?: string[], delayMs = 400) => {
    setIsTyping(true);
    if (agentSteps) {
      // Step-by-step animation for agent execution
      for (let i = 0; i < agentSteps.length; i++) {
        setCurrentSteps(prev => [...prev, agentSteps[i]]);
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
    setIsTyping(false);
    setCurrentSteps([]);
    setMessages(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        sender: 'kimi',
        text,
        timestamp: new Date(),
      },
    ]);
  };

  // Pergunta à IA com o histórico recente + catálogo PRÉ-FILTRADO por relevância à
  // pergunta (não os primeiros N do array — os mais relevantes de verdade, mesmo
  // scoring usado na busca determinística). Admin recebe um recorte maior, com
  // custo/peso/status oculto. A IA nunca recebe nem calcula frete/orçamento —
  // isso é 100% determinístico em outro lugar deste arquivo.
  const aiAnswer = async (userText: string): Promise<string | null> => {
    if (!qwenEnabled()) return null;
    const history: QwenMsg[] = messages
      .slice(-AI_HISTORY_TURNS)
      .map((m) => ({ role: m.sender === 'kimi' ? 'assistant' : 'user', content: m.text } as QwenMsg));
    history.push({ role: 'user', content: userText });

    const code = getCurrencyByCountry(selectedCountry);
    const symbol = code === 'JPY' ? '¥' : code === 'EUR' ? '€' : 'R$';
    const locale = { country: selectedCountry, currencyCode: code, currencySymbol: symbol };

    // Fixa no catálogo os produtos que o assistente acabou de mostrar (foco da
    // conversa) mesmo que a pergunta atual ("manda o link", "e o preço?") não
    // bata em nenhum termo de produto — sem isso, `relevantCatalogForAI` caía
    // no recorte genérico do catálogo (fallback por ordem, não por assunto) e a
    // IA ficava sem o ID real pra citar, arriscando inventar um link falso.
    const relevantRaw = relevantCatalogForAI(userText, isAdmin ? 60 : 30);
    const pinned = focusRef.current.filter((p) => !relevantRaw.some((r) => r.id === p.id));
    const relevant = [...pinned, ...relevantRaw].slice(0, isAdmin ? 60 : 30);
    const catalog = relevant
      .filter((p) => !p.hidden)
      .map((p) => {
        const rawFallback = (WEIGHT_BY_CATEGORY[p.category] || DEFAULT_WEIGHT).small;
        const wt = packedWeightG(p.weightGrams) || packedWeightG(rawFallback);
        return { id: p.id, name: productEnglishName(p), category: p.category, priceYen: p.prices?.small || 0, discount: p.discountPercent || 0, approxWeightGrams: wt };
      });

    if (isAdmin) {
      // Admin recebe o mesmo recorte relevante, mas incluindo ocultos/custo/peso real
      const adminCatalog: AdminCatalogItem[] = relevant.map((p) => {
        const rawWeight = WEIGHT_BY_CATEGORY[p.category] || DEFAULT_WEIGHT;
        const wt = { small: packedWeightG(rawWeight.small), large: packedWeightG(rawWeight.large) };
        return {
          id: p.id,
          name: productEnglishName(p),
          category: p.category,
          priceYen: p.prices?.small || 0,
          discount: p.discountPercent || 0,
          costYen: p.cost,
          weightGrams: p.weightGrams
            ? { small: packedWeightG(p.weightGrams), large: packedWeightG(p.weightGrams) }
            : wt,
          hidden: p.hidden,
        };
      });
      return askQwen(history, catalog, locale, { isAdmin: true, adminCatalog });
    }

    return askQwen(history, catalog, locale);
  };

  // Calcula o peso total de um produto para uma variante/tamanho específico
  const getProductWeight = (product: Product, size: string): number => {
    if (product.weightGrams) return packedWeightG(product.weightGrams);
    const rawWeight = WEIGHT_BY_CATEGORY[product.category] || DEFAULT_WEIGHT;
    return packedWeightG(size === 'large' ? rawWeight.large : rawWeight.small);
  };

  const handleCommandExecution = async (text: string) => {
    const query = text.toLowerCase().trim();


    // If in shipping flow, handle weight/country input
    if (shippingFlow === 'ask_country') {
      setShippingFlow('ask_weight');
      setShippingData(prev => ({ ...prev, country: query }));
      await addKimiMessageWithTyping(t('kimiclaw.shipping.ask_weight'));
      return;
    }

    if (shippingFlow === 'ask_weight') {
      setShippingFlow('idle');
      const weight = parseFloat(query);
      if (isNaN(weight) || weight <= 0) {
        await addKimiMessageWithTyping(
          language === 'pt' ? 'Por favor, digite um peso válido (Ex: 1.5)' : 'Please enter a valid weight (Ex: 1.5)'
        );
        setShippingFlow('ask_weight');
        return;
      }

      const country = shippingData.country || selectedCountry || 'Brasil';
      const results = calculateShipping(country, weight);

      if (country === 'Japão' && results.length === 0) {
        await addKimiMessageWithTyping(
          language === 'pt'
            ? `Frete dentro do Japão depende da província exata de entrega — não dá pra calcular sem esse dado aqui no chat. 📍 Veja o valor exato preenchendo o endereço na página de **Frete** ou no **Carrinho → Finalizar**, ou fale com um vendedor no WhatsApp **${WHATSAPP}**.`
            : language === 'ja'
              ? '日本国内の送料は配達先の都道府県によって変わるため、チャットだけでは正確な金額を計算できません。📍 正確な金額は配送ページかカートの手続きで住所を入力すると表示されます。'
              : `Shipping within Japan depends on the exact delivery prefecture — I can't calculate it here in chat. 📍 See the exact cost on the **Shipping** page or at **Cart → Checkout**, or ask a seller on WhatsApp **${WHATSAPP}**.`
        );
        setShippingData({});
        return;
      }

      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          sender: 'kimi',
          text: t('kimiclaw.shipping.result_header').replace('{country}', country).replace('{weight}', weight.toFixed(1)),
          timestamp: new Date(),
          shippingResults: results,
          shippingCountry: country,
          shippingWeight: weight
        }
      ]);
      setShippingData({});
      return;
    }

    // 0.A NAVEGAR POR CATEGORIA (prioridade alta: "quais doces tem", "me mostra cosméticos")
    const detectedCat = detectCategory(query);
    if (detectedCat) {
      if (showCategory(detectedCat)) return;
    }

    // 0a. ENCOMENDA / PEDIDO PERSONALIZADO — produto que a loja não tem em estoque
    if (/encomend|sob encomenda|personalizad|fazer um pedido|faca seu pedido|importar (pra|para) mim|conseguir (trazer|comprar)|tem como (trazer|conseguir|pedir)/.test(normalizeText(query))) {
      await addKimiMessageWithTyping(
        'Não achou na loja? Sem problema! 🎌 Você pode encomendar **qualquer produto japonês** pelo **"Faça seu Pedido"** no menu do topo — é só mandar o link/foto do que você quer que a equipe cota pra você. Vou te levar até lá! 📝'
      );
      setTimeout(() => navigate('/faca-seu-pedido'), 600);
      return;
    }

    // 0.PS ORÇAMENTO DETERMINÍSTICO (produto + frete real ≤ valor). 100% por regras —
    // usa preço real do catálogo (effectiveYen) + tabela de frete real do Japan Post
    // (catalogShippingYen). Não há IA: é impossível inventar preço ou frete.
    const qHasNumber = /\d/.test(query);
    // Moeda: aceita variações/erros de digitação de "reais" (reia, reis, real...) + estrangeiras
    const qHasCurrency = /reais?|real|reis?|reia|r\$|yen|ienes?|¥|euros?|€|dol[áa]r|\$/.test(query);
    const qHasValue = qHasNumber && qHasCurrency;
    const qHasLimit = /m[áa]ximo|at[ée]\s+\d|limite|n[ãa]o\s+passar|abaixo\s+de|menos\s+de|passa\s+de|no\s+m[áa]ximo|\bm[áa]x\b|inclus[oa]s?|gr[áa]tis/.test(query);
    const qHasShipping = /frete|envio|entrega|shipping/.test(query);
    // Orçamento explícito; OU (valor + limite); OU (frete + valor);
    // OU (frete + número + limite) — pega "frete incluso até 550" mesmo sem a moeda escrita.
    if (/or[çc]amento/.test(query) || (qHasValue && qHasLimit) || (qHasShipping && qHasValue) || (qHasShipping && qHasNumber && qHasLimit)) {
      const numMatch = query.match(/(\d+(?:[.,]\d{1,2})?)/);
      const budgetValue = numMatch ? parseFloat(numMatch[1].replace(',', '.')) : 0;
      const isYen = /yen|ienes?|¥/.test(query);
      const isEur = /euros?|€/.test(query);
      const isUsd = /dol[áa]r|dolar|usd|\$/.test(query);
      const budgetCurrency: 'BRL' | 'JPY' | 'EUR' | 'USD' = isYen ? 'JPY' : isEur ? 'EUR' : isUsd ? 'USD' : getCurrencyByCountry(selectedCountry);
      const country = selectedCountry || 'Brasil';
      const curSymbol = budgetCurrency === 'JPY' ? '¥' : budgetCurrency === 'EUR' ? '€' : budgetCurrency === 'USD' ? '$' : 'R$';
      const fmtBudget = (v: number): string => {
        if (budgetCurrency === 'BRL' || budgetCurrency === 'EUR') return `${curSymbol} ${Math.round(v).toLocaleString('pt-BR')}`;
        if (budgetCurrency === 'USD') return `$ ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        return `¥ ${Math.round(v).toLocaleString()}`;
      };

      await addKimiMessageWithTyping(
        '📊 Calculando com **preços e fretes reais** da loja (sem chute!)...',
        ['📊 Filtrando o catálogo pelo seu orçamento...']
      );

      if (!budgetValue) {
        await addKimiMessageWithTyping('Quanto você quer gastar? Me diga o valor e a moeda, por exemplo: **"produtos até 550 reais com frete"**. 📦');
        return;
      }

      // ── Filtro por palavra-chave de PRODUTO (correção do bug do "shampoo") ──
      // Antes o orçamento listava os 5 produtos MAIS BARATOS do catálogo, ignorando
      // o que o cliente pediu (ex.: pedia "kit de shampoo até 500" e vinham doces).
      // Agora extraímos as palavras de produto da pergunta (shampoo, kit, protetor...)
      // e só consideramos produtos que casam com elas. Se nada bater, oferecemos
      // encomenda em vez de devolver produtos irrelevantes.
      const BUDGET_STOP = new Set([
        'frete', 'envio', 'entrega', 'shipping', 'brasil', 'brazil', 'bra', 'br',
        'valor', 'valores', 'maximo', 'max', 'minimo', 'min', 'limite', 'limites',
        'reais', 'real', 'reia', 'reis', 'rs', 'yen', 'iene', 'ienes', 'euro', 'euros',
        'dolar', 'dolares', 'usd', 'para', 'pro', 'pra', 'com', 'de', 'lista', 'faca',
        'fazer', 'quero', 'queria', 'orcamento', 'orcamentos', 'incluso', 'inclusos',
        'incluida', 'incluidas', 'gratis', 'abaixo', 'menos', 'passar', 'passe', 'ate',
        'ja', 'todo', 'todos', 'algum', 'alguns', 'tipo', 'tipos', 'quais', 'qual',
        'mostra', 'mostrar', 'tem', 'ter', 'existe', 'vende', 'vendem', 'produto',
        'produtos', 'custar', 'custe', 'gastar', 'gaste',
        // Palavras genéricas de EMBALAGEM/QUANTIDADE — não descrevem um produto,
        // então não podem servir de filtro (ex.: "kit" casaria com KitKat e com
        // "Kit com 12 Pacotes", devolvendo chocolates/algas quando o cliente
        // pediu "kit de shampoo"). Devem ser ignoradas.
        'kit', 'kits', 'pacote', 'pacotes', 'pack', 'packs', 'caixa', 'caixas',
        'combo', 'conjunto', 'conjuntos', 'unidade', 'unidades', 'embalagem',
        'embalagens', 'sache', 'saches', 'sachê', 'sachês', 'garrafa', 'garrafas',
        'pct', 'pcts', 'cx', 'un', 'pote', 'potes', 'tubo', 'tubos',
      ]);
      const keywordTokens = tokenize(query).filter((tk) => {
        const digits = tk.replace(/[^0-9.,]/g, '');
        return tk.length >= 3 && !BUDGET_STOP.has(tk) && digits === '';
      });

      // IDs de produtos que casam com as palavras-chave (se houver). Ignorado quando
      // o cliente não nomeou produto nenhum (ex.: "produtos até 500 com frete").
      let mustMatchIds: Set<string> | null = null;
      let keywordExistsInCatalog = false;
      if (keywordTokens.length > 0) {
        mustMatchIds = new Set<string>();
        for (const p of products) {
          if (p.hidden) continue;
          const hayParts = [
            productEnglishName(p), p.id, p.description || '', p.flavor || '',
            p.category || '', (p.tags || []).join(' '),
          ].map(normalizeText);
          const hay = hayParts.join(' ');
          const matched = keywordTokens.some((tok) => {
            if (tok.length < 3) return false;
            if (hay.includes(tok)) return true;
            // sinônimos/singular-plural comuns de higiene e cosmético
            if (/^shamp/.test(tok) && hay.includes('shamp')) return true;
            if (/^shamp/.test(tok) && hay.includes('shampoo')) return true;
            if (/^condicion/.test(tok) && hay.includes('condicion')) return true;
            if (/^sabonete/.test(tok) && hay.includes('sabonete')) return true;
            if (/^hidratant/.test(tok) && hay.includes('hidratant')) return true;
            return false;
          });
          if (matched) {
            keywordExistsInCatalog = true;
            mustMatchIds.add(p.id);
          }
        }
      }

      const pool = products.filter((p) => !p.hidden && (!mustMatchIds || mustMatchIds.has(p.id)));

      const candidates = pool
        .map((p) => {
          const priceYen = effectiveYen(p, 'small');
          const shipYen = catalogShippingYen(p, country);
          const totalYen = priceYen + shipYen;
          return {
            p,
            totalLocal: fxConvert(totalYen, budgetCurrency),
            priceLocal: fxConvert(priceYen, budgetCurrency),
            shipLocal: fxConvert(shipYen, budgetCurrency),
          };
        })
        .filter((x) => x.totalLocal > 0 && x.totalLocal <= budgetValue)
        .sort((a, b) => a.totalLocal - b.totalLocal)
        .slice(0, 5);

      if (candidates.length === 0) {
        // O cliente nomeou um produto/categoria (ex.: "shampoo") que NÃO existe
        // no catálogo → não inventa; encaminha pra encomenda (Faça seu Pedido).
        if (keywordTokens.length > 0 && !keywordExistsInCatalog) {
          const kw = keywordTokens.map((k) => `**${k}**`).join(', ');
          await addKimiMessageWithTyping(
            `Procurei no catálogo por ${kw} com frete pra **${country}** dentro de **${fmtBudget(budgetValue)}**, mas não tenho esse item em estoque agora. 😕\n\nSem problema! 🎌 Você pode **encomendar** pelo **\"Faça seu Pedido\"** no menu do topo — é só mandar o link/foto do shampoo japonês que você quer que a equipe cotiza o preço + frete pra você. 📦`,
            ['🔍 Procurando no catálogo...']
          );
          setTimeout(() => navigate('/faca-seu-pedido'), 700);
          return;
        }
        // O produto existe, mas nenhum cabe no orçamento informado.
        const dica = keywordTokens.length > 0
          ? `Tenho **${keywordTokens.map((k) => k).join(', ')}** no catálogo, mas nenhum cabe em **${fmtBudget(budgetValue)}** já com frete. 😕`
          : `Não encontrei nenhum produto (com frete pra **${country}**) que caiba em **${fmtBudget(budgetValue)}**. 😕`;
        await addKimiMessageWithTyping(
          `${dica} Tente um valor um pouco maior, ou fale com um vendedor no WhatsApp **${WHATSAPP}** (${WHATSAPP_LINK}) pra uma cotação sob medida! 📦`
        );
        return;
      }

      const cards = candidates.map((c) => c.p);
      const summary = candidates
        .map((c) => `• **${c.p.name}** — ${fmtBudget(c.totalLocal)} (produto ${fmtBudget(c.priceLocal)} + frete ${fmtBudget(c.shipLocal)})`)
        .join('\n');
      const headerText = `Encontrei **${candidates.length}** ${candidates.length === 1 ? 'produto que cabe' : 'produtos que cabem'} em ${fmtBudget(budgetValue)} (frete pra ${country} já incluso):\n\n${summary}\n\nToque num card e depois em **Adicionar** pra colocar no carrinho. 🛒`;

      setMessages((prev) => [
        ...prev,
        { id: Math.random().toString(36).substring(7), sender: 'kimi', text: headerText, timestamp: new Date(), products: cards },
      ]);
      return;
    }

    // 0.S SELEÇÃO / FECHAMENTO DE PEDIDO — quando o cliente ESCOLHE um produto que o
    // bot acabou de recomendar (ex.: "quero esse X", "vamos nesse", "pode ser esse",
    // "gostei desse", "comprar o primeiro"). NÃO é busca burra — é intenção de COMPRA.
    // Discriminador: verbo de escolha + pronome demonstrativo (esse/este/aquele/primeiro...).
    // Assim "quero ver shampoos" continua sendo busca, mas "quero ESSE shampoo" vira seleção.
    const qNorm = normalizeText(query);
    const selVerb = /(quero|queria|vamos|bora|pode ser|fech[aou]?|comprar|compra|lev[ao]|levar|gostei|gosto|escolh[oi]|prefiro|adicion[ae]|coloc[ao]|ped[i]?r|encomendar|finalizar|concluir|confirmo|topo|bora)/.test(qNorm);
    const selTarget = /(ess[ea]|est[ea]|aquele|aquela|aquel[ea]s?|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|ultim[oa]|mesm[oa]|desse|dessa|deste|desta|mostrad|indicad|recomendad|apresentad)/.test(qNorm);
    if (selVerb && selTarget) {
      const results = searchProducts(query, { requireStrong: true });

      // (a) Catálogo não tem o item exato → encaminha para encomenda (não busca burra)
      if (results.length === 0) {
        await addKimiMessageWithTyping(
          `Perfeito! Vou te levar para o **"Faça seu Pedido"** pra finalizar a compra de **${text.trim()}** com a equipe — eles calculam o frete certinho e fecham com você. 📝`,
          ['🛒 Preparando seu pedido...']
        );
        setTimeout(() => navigate('/faca-seu-pedido'), 700);
        return;
      }

      // (b) Match único → adiciona ao carrinho e orienta o checkout
      if (results.length === 1) {
        const targetProduct = results[0];
        addToCart(targetProduct, 'small', 1);
        toast.success(`Adicionado: 1x ${targetProduct.name}`);
        await addKimiMessageWithTyping(
          `Boa escolha! ✅ Adicionei o **${targetProduct.name}** ao seu carrinho. Pra finalizar com o frete pra Brasil, vá em **Carrinho → Finalizar** ou confirme direto com um vendedor no WhatsApp **${WHATSAPP}** (${WHATSAPP_LINK}). 📦`,
          ['🛒 Adicionando ao carrinho...']
        );
        return;
      }

      // (c) Várias variantes (refil, kit, pack...) → mostra como SELEÇÃO, não como busca.
      // Enquadra como fechamento de pedido: o cliente escolhe qual variante quer.
      await addKimiMessageWithTyping(
        `Ótima escolha! 🎯 Encontrei estas versões — toque na que você quer que eu adicione ao carrinho, ou me diga qual (ex.: "quero o kit completo"). Também posso fechar direto pelo **Faça seu Pedido** ou pelo WhatsApp **${WHATSAPP}**. 📦`
      );
      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          sender: 'kimi',
          text: '',
          timestamp: new Date(),
          products: results
        }
      ]);
      return;
    }

    // 0. SEARCH PRODUCTS SKILL
    if (query.includes('buscar') || query.includes('procurar') || query.includes('pesquisar') || query.includes('search') || query.includes('find') || query.includes('tem ') || query.includes('mostrar') || query.includes('achar') || query.includes('encontrar')) {
      // Busca exige match FORTE (nome/categoria/marca) — evita resultados aleatórios
      const results = searchProducts(query, { requireStrong: true });

      if (results.length === 0) {
        // Sem match direto → deixa a IA responder de forma completa (vê o catálogo).
        setIsTyping(true);
        const ai = await aiAnswer(text);
        setIsTyping(false);
        await addKimiMessageWithTyping(
          ai ||
          `Não encontrei **"${text.trim()}"** no nosso catálogo. 😕 Mas você pode encomendar pelo **"Faça seu Pedido"** no menu do topo — a equipe consegue trazer do Japão pra você! 🎌`
        );
        return;
      }

      const headerMsg = t('kimiclaw.search.found').replace('{count}', results.length.toString());
      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          sender: 'kimi',
          text: headerMsg,
          timestamp: new Date(),
          products: results
        }
      ]);
      return;
    }

    // 1. ADD PRODUCT SKILL — adiciona ao carrinho SÓ com match determinístico.
    // Extrai o nome do produto e busca no catálogo: 1 match → adiciona; vários → mostra
    // as opções; nenhum → orienta. NUNCA chuta (antes usava products[0] e errava o item).
    if ((query.includes('adicionar') || query.includes('add') || query.includes('coloca')) && query.includes('carrinho')) {
      const productName = query
        .replace(/no carrinho|ao carrinho|para o carrinho|pra o carrinho|pra carrinho|carrinho/g, ' ')
        .replace(/adicion[ae]r?|add|coloc[ao]r?|quero|pode|por favor|favor/g, ' ')
        .replace(/\b(o|a|os|as|um|uma|no|ao|de|e|meu|pra|para)\b/g, ' ')
        .trim();

      // Sem nome na frase ("adiciona no carrinho"), cai no produto em foco —
      // normalmente o que o assistente acabou de recomendar.
      if (!productName && focusRef.current.length === 0) {
        await addKimiMessageWithTyping('Qual produto você quer adicionar ao carrinho? Me diga o nome, por exemplo: **"adicionar kit fino no carrinho"**. 🛒');
        return;
      }

      const results = productName ? resolveProducts(productName) : focusRef.current;

      if (results.length === 0) {
        await addKimiMessageWithTyping(`Não encontrei **"${productName}"** no catálogo. 😕 Posso buscar por outro nome, ou você pode encomendar pelo **"Faça seu Pedido"** no menu do topo! 📝`);
        return;
      }

      if (results.length === 1) {
        const targetProduct = results[0];
        addToCart(targetProduct, 'small', 1);
        toast.success(language === 'pt' ? `Adicionado: 1x ${targetProduct.name}` : `Added: 1x ${targetProduct.name}`);
        const cur = selectedCountry === 'Japão' ? 'JPY' : getCurrencyByCountry(selectedCountry);
        await addKimiMessageWithTyping(
          language === 'pt'
            ? `Feito! ✅ Adicionei **1x ${targetProduct.name}** ao seu carrinho por **${formatPrice(fxConvert(effectiveYen(targetProduct, 'small'), cur), cur)}**. Vá em **Carrinho → Finalizar** pra calcular o frete e fechar o pedido. 🛒`
            : `Done! ✅ Added **1x ${targetProduct.name}** to your cart. Go to **Cart → Checkout** to finish. 🛒`,
          [language === 'pt' ? '🛒 Adicionando ao carrinho...' : '🛒 Adding to cart...']
        );
        return;
      }

      // Vários produtos batem → mostra as opções pra VOCÊ escolher (não chuta).
      await addKimiMessageWithTyping(`Encontrei ${results.length} produtos com esse nome. Toque no card que você quer e depois em **Adicionar** — eu não escolho por você pra não errar o item. 🎯`);
      setMessages((prev) => [
        ...prev,
        { id: Math.random().toString(36).substring(7), sender: 'kimi', text: '', timestamp: new Date(), products: results },
      ]);
      return;
    }

    // 2. INFORMA O CUPOM DE BOAS-VINDAS (validação real é feita no carrinho)
    if (query.includes('cupom') || query.includes('desconto') || query.includes('coupon')) {
      const steps = [
        language === 'pt' ? '🎟️ Buscando cupons disponíveis...' : '🎟️ Looking up coupons...',
      ];

      const responseText = language === 'pt'
        ? `Use o cupom de boas-vindas **BEMVINDO10** (10% de desconto) digitando-o no campo "Cupom de Desconto" do seu carrinho. Cupons são validados na hora — só funcionam se estiverem ativos e disponíveis para a sua conta.`
        : `Use the welcome coupon **BEMVINDO10** (10% off) by typing it in the "Coupon" field in your cart. Coupons are validated on the spot — they only work if active and available for your account.`;

      await addKimiMessageWithTyping(responseText, steps);
      return;
    }

    // 3. INSCRIÇÃO EM NOVIDADES (apenas marca a flag — NÃO envia/abre WhatsApp Web)
    if (query.includes('whatsapp') || query.includes('whatsappweb') || query.includes('enviar') || query.includes('notificac') || query.includes('novidades')) {
      updateProfile({ whatsappMarketing: true });
      await addKimiMessageWithTyping(
        language === 'pt'
          ? 'Pronto! ✅ Você foi inscrito para receber **novidades e promoções exclusivas**. Pode gerenciar isso em **Meu Perfil** quando quiser.'
          : language === 'ja'
            ? '完了しました！✅ 新着情報と限定プロモーションの受信に登録されました。**マイページ**で管理できます。'
            : 'Done! ✅ You are subscribed to **news and exclusive promotions**. Manage it anytime in **My Profile**.'
      );
      return;
    }

    // Detecção de idioma só com INTENÇÃO explícita (evita 'brasil'/'frete' trocarem idioma)
    const nquery = normalizeText(query);
    const langIntent = /(idioma|lingua|language|mudar|trocar|alterar|falar|switch)/.test(nquery);

    // 4. LANGUAGE TO JAPANESE
    if (/\b(japones|nihongo)\b/.test(nquery) || query.includes('日本語') ||
        (langIntent && /(japao|japan|\bjp\b|\bja\b)/.test(nquery))) {
      setLanguage('ja');
      toast.success('Idioma alterado para 日本語');
      await addKimiMessageWithTyping('言語を日本語に切り替えました！', ['🌐 Mudar idioma...']);
      return;
    }

    // 5. LANGUAGE TO PORTUGUESE
    if (/\bportugues\b/.test(nquery) ||
        (langIntent && /(portug|brasil|\bbr\b|\bpt\b)/.test(nquery))) {
      setLanguage('pt');
      toast.success('Idioma alterado para Português');
      await addKimiMessageWithTyping('Idioma alterado de volta para Português com sucesso!', ['🌐 Mudar idioma...']);
      return;
    }

    // 6. CLEAR CART
    if (query.includes('limpar') || query.includes('esvaziar') || query.includes('clear')) {
      clearCart();
      toast.success('Carrinho limpo!');
      await addKimiMessageWithTyping('Pronto! Seu carrinho foi esvaziado.', ['🗑️ Limpando carrinho...']);
      return;
    }

    // 7A. ADMIN: queries financeiras/dashboard → dados reais via API segura (/api/admin-dashboard)
    if (isAdmin && (
      query.includes('faturamento') || query.includes('faturou') || query.includes('faturei') ||
      query.includes('receita') || query.includes('vendas') || query.includes('vendeu') ||
      query.includes('pedidos este mes') || query.includes('pedidos do mes') ||
      query.includes('dashboard') || query.includes('estatística') || query.includes('estatistica') ||
      query.includes('métricas') || query.includes('metricas') || query.includes('relatório') || query.includes('relatorio') ||
      (query.includes('pedidos') && (query.includes('quantos') || query.includes('total') || query.includes('mes')))
    )) {
      try {
        const res = await authenticatedFetch('/api/admin-dashboard');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const dashboard = await res.json();
        const stats = dashboard.stats;
        const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const fmt = (v: number) => `¥${Math.round(v).toLocaleString()}`;
        const pct = stats.revenueLastMonth > 0
          ? ((stats.revenueThisMonth - stats.revenueLastMonth) / stats.revenueLastMonth * 100).toFixed(1)
          : null;
        const trend = pct !== null ? (Number(pct) >= 0 ? `📈 +${pct}%` : `📉 ${pct}%`) + ' vs mês passado' : '';

        const response =
          `📊 **Dashboard — ${monthName}**\n\n` +
          `**Este mês:** ${stats.ordersThisMonth} pedido${stats.ordersThisMonth !== 1 ? 's' : ''} · ${fmt(stats.revenueThisMonth)} ${trend}\n` +
          `**Mês passado:** ${stats.ordersLastMonth} pedido${stats.ordersLastMonth !== 1 ? 's' : ''} · ${fmt(stats.revenueLastMonth)}\n` +
          `**Total histórico:** ${stats.totalOrders} pedidos · ${fmt(stats.totalRevenue)}\n\n` +
          `**Status dos pedidos:**\n` +
          `• ⏳ Pendentes: ${stats.pendingOrders}\n` +
          `• 🚚 Enviados: ${stats.shippedOrders}\n` +
          `• ✅ Entregues: ${stats.deliveredOrders}\n` +
          (stats.cancelledOrders > 0 ? `• ❌ Cancelados: ${stats.cancelledOrders}\n` : '') +
          `\nAcesse o painel **/admin** para detalhes completos de cada pedido.`;

        await addKimiMessageWithTyping(response, ['📊 Consultando pedidos...']);
      } catch (e) {
        console.error('[KimiClaw] admin-dashboard fetch falhou:', e);
        await addKimiMessageWithTyping(
          'Não consegui buscar os dados do dashboard agora. Tente novamente ou acesse o painel **/admin** diretamente.',
          ['📊 Consultando pedidos...']
        );
      }
      return;
    }

    // 7B. Frete de um produto específico, com peso real/estimado do catálogo.
    // Vale para cliente e admin: usa o produto citado na pergunta ou, quando ela
    // não cita nenhum, o que está em foco na conversa.
    if (query.includes('frete') || query.includes('shipping') || query.includes('envio')) {
      // Peso explícito ("2kg") é do cliente, não do produto — aí o fluxo genérico
      // do skill 7 assume, senão o peso do catálogo sobrescreveria o que ele disse.
      const hasExplicitWeight = /\d+(?:[.,]\d+)?\s*kg/i.test(query);
      const productMatch = hasExplicitWeight ? [] : resolveProducts(query);
      if (productMatch.length > 0) {
        const prod = productMatch[0];
        const sizeHint = query.includes('grande') || query.includes('large') ? 'large' : 'small';
        const weightG = getProductWeight(prod, sizeHint);
        const weightKg = weightG / 1000;

        let detectedCountry = '';
        if (query.includes('brasil') || query.includes('brazil') || query.includes('br')) detectedCountry = 'Brasil';
        else if (query.includes('japao') || query.includes('japan')) detectedCountry = 'Japão';
        else if (query.includes('portugal')) detectedCountry = 'Portugal';
        else if (query.includes('franca') || query.includes('france')) detectedCountry = 'França';
        else if (query.includes('italia') || query.includes('italy')) detectedCountry = 'Itália';
        else if (query.includes('espanha') || query.includes('spain')) detectedCountry = 'Espanha';
        else detectedCountry = selectedCountry || 'Brasil';

        const results = calculateShipping(detectedCountry, weightKg);
        if (detectedCountry === 'Japão' && results.length === 0) {
          await addKimiMessageWithTyping(`📦 **${prod.name}** — frete doméstico no Japão depende da província exata de entrega (zona 1-4 a partir de Hiroshima). Calcule o valor exato preenchendo o endereço no Checkout.`);
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            sender: 'kimi',
            text: `📦 **${prod.name}** — ${sizeHint === 'large' ? 'tamanho Grande' : 'tamanho Pequeno'} (~${weightG}g)\nFrete estimado para **${detectedCountry}**:`,
            timestamp: new Date(),
            shippingResults: results,
            shippingCountry: detectedCountry,
            shippingWeight: weightKg,
            // Mantém o foco no produto que acabou de ser respondido: sem isto,
            // "frete do pocky" → "adiciona no carrinho" adicionaria o produto
            // anterior. Também mostra o card, que o cliente pode clicar.
            products: [prod],
          },
        ]);
        return;
      }
    }

    // 7. CALCULATE SHIPPING INLINE — só quando fala explicitamente de FRETE/ENVIO.
    // "quanto custa <produto>" NÃO é frete → segue para a IA (estimativa com 40%).
    if (query.includes('frete') || query.includes('shipping') || query.includes('envio') ||
        (query.includes('calcular') && /(frete|envio|entrega)/.test(query))) {
      // Try to extract country from query
      let detectedCountry = '';
      if (query.includes('brasil') || query.includes('br')) detectedCountry = 'Brasil';
      else if (query.includes('japao') || query.includes('japan')) detectedCountry = 'Japão';
      else if (query.includes('portugal') || query.includes('pt')) detectedCountry = 'Portugal';
      else if (query.includes('franca') || query.includes('france')) detectedCountry = 'França';
      else if (query.includes('italia') || query.includes('italy')) detectedCountry = 'Itália';
      else if (query.includes('espanha') || query.includes('spain')) detectedCountry = 'Espanha';

      // Try to extract weight from query (e.g., "2kg", "2.5 kg")
      const weightMatch = query.match(/(\d+(?:\.\d+)?)\s*kg/i);
      const weight = weightMatch ? parseFloat(weightMatch[1]) : 0;

      // If both country and weight are detected, show result immediately
      if (detectedCountry && weight > 0) {
        const results = calculateShipping(detectedCountry, weight);
        if (detectedCountry === 'Japão' && results.length === 0) {
          await addKimiMessageWithTyping(
            language === 'pt'
              ? 'Frete dentro do Japão depende da província exata de entrega — não dá pra calcular sem esse dado aqui no chat. 📍 Veja o valor exato preenchendo o endereço na página de **Frete** ou no **Carrinho → Finalizar**.'
              : language === 'ja'
                ? '日本国内の送料は配達先の都道府県によって変わるため、チャットだけでは正確な金額を計算できません。📍 配送ページかカートの手続きで住所を入力すると正確な金額が表示されます。'
                : "Shipping within Japan depends on the exact delivery prefecture — I can't calculate it here. 📍 See the exact cost on the **Shipping** page or at **Cart → Checkout**."
          );
          return;
        }
        setMessages(prev => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            sender: 'kimi',
            text: t('kimiclaw.shipping.result_header').replace('{country}', detectedCountry).replace('{weight}', weight.toFixed(1)),
            timestamp: new Date(),
            shippingResults: results,
            shippingCountry: detectedCountry,
            shippingWeight: weight
          }
        ]);
        return;
      }

      // If only country is detected, ask for weight
      if (detectedCountry) {
        setShippingFlow('ask_weight');
        setShippingData({ country: detectedCountry });
        await addKimiMessageWithTyping(t('kimiclaw.shipping.ask_weight'));
        return;
      }

      // Otherwise, ask for country
      setShippingFlow('ask_country');
      await addKimiMessageWithTyping(t('kimiclaw.shipping.ask_country'));
      return;
    }

    // 8. NAVIGATE TO VLOG
    if (query.includes('vlog') || query.includes('video') || query.includes('depoimento') || query.includes('unboxing')) {
      navigate('/vlog');
      await addKimiMessageWithTyping('Abre a página do **Vlog**! Assista aos reviews reais dos envios do Japão.', ['🎥 Navegando...']);
      return;
    }

    // 9. GENERAL RESPONSE
    let responseText = '';
    if (query.includes('oi') || query.includes('ola') || query.includes('hello')) {
      if (isAdmin) {
        responseText = '👋 Olá, Admin! Aqui estão seus dados de negócio. Pergunte sobre **faturamento**, **pedidos**, **margem/custo** de produtos ou **frete**. Para o painel completo acesse **/admin**.';
      } else {
        responseText = 'Olá! Sou o KimiClaw, o assistente de compras da NikkeyBox. Posso buscar produtos, adicionar itens ao carrinho, montar um orçamento dentro do seu valor, mudar o idioma, calcular o frete ou inscrever você em novidades. O que deseja?';
      }
      await addKimiMessageWithTyping(responseText);
      return;
    }

    // 9.3 USUÁRIO: deflexão para perguntas financeiras/administrativas
    if (!isAdmin && (
      query.includes('faturamento') || query.includes('receita') || query.includes('lucro') ||
      query.includes('dashboard') || query.includes('estatística') || query.includes('estatistica') ||
      query.includes('métricas') || query.includes('metricas') || query.includes('relatório') ||
      query.includes('vendas da loja') || query.includes('pedidos da loja')
    )) {
      await addKimiMessageWithTyping('Sou a assistente de compras! Posso ajudar com **produtos**, **preços** e **frete** 🛍️\n\nTente: "buscar anessa", "calcular frete" ou "quanto custa o biore".');
      return;
    }

    // 9.5 IA conversacional — só chega aqui quando NENHUM skill determinístico bateu
    // acima (busca, carrinho, orçamento, frete, categoria, cupom já tentaram e
    // falharam). A IA nunca recebe nem calcula preço/frete — só entende a pergunta,
    // conversa, e recomenda produtos do catálogo real citando o ID (tag
    // |||PRODUCT_IDS), nunca escrevendo valores. Ver api/kimiclaw.js para as
    // garantias contra alucinação de preço.
    if (qwenEnabled()) {
      setIsTyping(true);
      const ai = await aiAnswer(text);
      setIsTyping(false);
      if (ai) {
        // Extrai os IDs dos produtos recomendados pela tag |||PRODUCT_IDS → mostra
        // cards. O prompt pede o formato exato "|||PRODUCT_IDS: id1,id2", mas o
        // modelo às vezes desvia (sem os dois-pontos, IDs entre colchetes, ou
        // separados por espaço em vez de vírgula) — sem tolerância a isso, a tag
        // não batia, o card não aparecia E o texto cru da tag vazava pro cliente
        // (o "|||PRODUCT_IDS [id] [id]" ficava visível). O regex casa qualquer uma
        // dessas variações; os tokens extraídos só viram card se baterem com um ID
        // real do catálogo — lixo residual (ex.: uma palavra solta) nunca gera card.
        let responseText = ai;
        let recommendedProducts: Product[] | undefined;
        const markerMatch = responseText.match(/\|\|\|\s*PRODUCT_IDS\s*:?\s*/i);
        if (markerMatch && markerMatch.index !== undefined) {
          const afterMarker = responseText.slice(markerMatch.index + markerMatch[0].length);
          const idsLine = afterMarker.split('\n')[0]; // só a linha da tag, ignora texto solto depois
          responseText = responseText.slice(0, markerMatch.index).trim();
          const ids = idsLine
            .split(/[,\s]+/)
            .map((s) => s.replace(/[[\]]/g, '').trim())
            .filter(Boolean)
            .slice(0, 5);
          recommendedProducts = products.filter((p) => ids.includes(p.id));
        }
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            sender: 'kimi',
            text: responseText,
            timestamp: new Date(),
            ...(recommendedProducts && recommendedProducts.length > 0 ? { products: recommendedProducts } : {}),
          },
        ]);
        return;
      }
    }

    // Fallback (só se a IA estiver fora do ar): busca por palavra-chave no catálogo
    if (!query.includes('oi') && !query.includes('ola') && !query.includes('hello')) {
      const autoResults = searchProducts(query, { requireStrong: true });
      if (autoResults.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            sender: 'kimi',
            text: t('kimiclaw.search.found').replace('{count}', autoResults.length.toString()),
            timestamp: new Date(),
            products: autoResults,
          },
        ]);
        return;
      }
    }

    // 9.9 BLOQUEIO DE ESCOPO — o KimiClaw só ajuda com a loja NikkeyBox.
    // Perguntas fora do escopo (conhecimento geral, outras empresas, off-topic) são
    // recusadas educadamente e redirecionadas para as habilidades da loja.
    const scopeRefusal = language === 'pt'
      ? 'Desculpe, só consigo ajudar com a **loja NikkeyBox** (produtos, preços, frete e pedidos). 🛍️\n\nO que eu posso fazer por você:\n🔍 **buscar** produtos (ex: "kitkat", "biore")\n💰 **orçamento** (ex: "produtos até 550 reais com frete")\n📦 **calcular** frete\n🎟️ **cupom** de boas-vindas\n🗑️ **limpar** carrinho'
      : language === 'ja'
        ? 'NikkeyBoxストアに関するご質問のみお答えできます（商品・価格・送料・ご注文）。🛍️\n\n🔍 商品検索 / 💰 予算内の商品 / 📦 送料計算 / 🎟️ クーポン / 🗑️ カート削除'
        : "Sorry, I can only help with the **NikkeyBox store** (products, prices, shipping, orders). 🛍️\n\nWhat I can do:\n🔍 **search** products | 💰 **budget** (e.g. \"items up to R$550 with shipping\") | 📦 **shipping** | 🎟️ **coupon** | 🗑️ **clear cart**";
    await addKimiMessageWithTyping(scopeRefusal);
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userText = inputValue;
    setMessages(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        sender: 'user',
        text: userText,
        timestamp: new Date(),
      },
    ]);
    setInputValue('');
    handleCommandExecution(userText);
  };

  const handleSuggestionClick = (skillText: string, searchKey: string) => {
    if (isTyping) return;
    setMessages(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        sender: 'user',
        text: skillText,
        timestamp: new Date(),
      },
    ]);
    handleCommandExecution(searchKey);
  };

  const handleConsentAction = async (accept: boolean, order?: any) => {
    // Marca este pedido como respondido → esconde os botões e evita repetição
    const orderKey = order?.orderNumber || order?.id;
    if (orderKey) {
      if (respondedOrders.includes(orderKey)) return; // já respondeu, ignora cliques extras
      setRespondedOrders(prev => [...prev, orderKey]);
    }

    if (!accept) {
      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          sender: 'kimi',
          text: language === 'pt' ? 'Tudo bem! Se mudar de ideia, é só ativar no seu perfil.' : 'No problem! You can enable it anytime in your profile.',
          timestamp: new Date()
        }
      ]);
      return;
    }

    // Apenas MARCA o cliente para receber novidades/promoções (NÃO envia nada,
    // não abre WhatsApp Web). O telefone do pedido fica salvo para uso futuro.
    const phone = order?.phone || user?.phone;
    updateProfile({ whatsappMarketing: true, ...(phone ? { phone } : {}) });

    const confirmText = language === 'pt'
      ? 'Pronto! ✅ Você foi inscrito para receber **novidades e promoções exclusivas**. Pode ativar ou desativar isso quando quiser em **Meu Perfil**.'
      : language === 'ja'
        ? '完了しました！✅ 新着情報と限定プロモーションの受信に登録されました。**マイページ**でいつでも変更できます。'
        : 'Done! ✅ You are now subscribed to **news and exclusive promotions**. You can turn this on/off anytime in **My Profile**.';

    setMessages(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        sender: 'kimi',
        text: confirmText,
        timestamp: new Date()
      }
    ]);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] font-sans">
      {/* ATTENTION BADGE */}
      {showAttentionBadge && !isOpen && (
        <div className="absolute bottom-16 right-2 bg-gradient-to-r from-primary to-accent text-white text-xs px-3 py-1.5 rounded-full shadow-elevated whitespace-nowrap animate-float border border-white/20 select-none">
          <span className="flex items-center gap-1.5 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
            {t('kimiclaw.tryMe')}
          </span>
          <div className="absolute -bottom-1 right-5 w-2 h-2 bg-accent rotate-45 border-r border-b border-white/10" />
        </div>
      )}

      {/* FLOATING ACTION BUTTON */}
      {!isOpen && (
        <button
          ref={fabButtonRef}
          onClick={() => setIsOpen(true)}
          aria-label={t('kimiclaw.title')}
          aria-haspopup="dialog"
          aria-expanded={false}
          aria-controls="kimiclaw-panel"
          className="w-14 h-14 rounded-full bg-gradient-to-tr from-primary via-accent to-primary text-white flex items-center justify-center shadow-elevated hover:shadow-[0_8px_30px_rgb(249,115,22,0.4)] transition-all duration-300 transform hover:scale-105 border border-white/20 group relative overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ClawIcon className="w-7 h-7 text-white transform group-hover:rotate-12 transition-transform duration-300" />
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-white animate-ping" />
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-white" />
        </button>
      )}

      {/* CHAT WINDOW CONTAINER */}
      {isOpen && (
        <div
          id="kimiclaw-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={t('kimiclaw.title')}
          tabIndex={-1}
          className="w-[calc(100vw-2rem)] sm:w-[390px] max-w-[390px] h-[550px] max-h-[85vh] rounded-2xl border border-white/20 shadow-elevated bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl flex flex-col overflow-hidden animate-fade-up focus:outline-none"
        >
          {/* HEADER */}
          <div className="p-4 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white shadow-soft relative">
                <ClawIcon className="w-5.5 h-5.5 text-white" />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  {t('kimiclaw.title')}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary-dark dark:text-primary font-mono font-medium">
                    v1.5
                  </span>
                  {isAdmin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/30">
                      ADMIN
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {isAdmin
                    ? (language === 'pt' ? 'Modo Admin — dashboard · pedidos · catálogo' : 'Admin Mode — dashboard · orders · catalog')
                    : t('kimiclaw.subtitle')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label={t('kimiclaw.close')}
              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* MESSAGES FEED */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {msg.sender === 'kimi' && (
                  <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-primary shrink-0 self-end shadow-soft">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div className="max-w-[78%] flex flex-col gap-2">
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-xs shadow-soft leading-relaxed whitespace-pre-line ${
                      msg.sender === 'user'
                        ? 'bg-primary text-white rounded-br-none'
                        : 'bg-card text-card-foreground border border-border rounded-bl-none'
                    }`}
                  >
                    {msg.text.split('**').map((chunk, idx) => 
                      idx % 2 === 1 ? <strong key={idx} className="font-semibold">{chunk}</strong> : chunk
                    )}
                  </div>
                  
                  {/* CONSENT PROMPT ACTION BUTTONS (somem após responder ou se já inscrito) */}
                  {msg.isConsentPrompt &&
                    !user?.whatsappMarketing &&
                    !respondedOrders.includes(msg.orderToShare?.orderNumber || msg.orderToShare?.id) && (
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => handleConsentAction(true, msg.orderToShare)}
                        className="text-[11px] font-bold bg-primary hover:bg-primary/95 text-white px-3 py-1.5 rounded-lg shadow-soft transition-all"
                      >
                        ✅ {language === 'pt' ? 'Sim, quero receber!' : 'Yes, subscribe me!'}
                      </button>
                      <button
                        onClick={() => handleConsentAction(false, msg.orderToShare)}
                        className="text-[11px] font-semibold bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-lg transition-all"
                      >
                        ❌ {language === 'pt' ? 'Não, obrigado' : 'No, thanks'}
                      </button>
                    </div>
                  )}

                  {/* PRODUCT SEARCH RESULTS */}
                  {msg.products && msg.products.length > 0 && (
                    <div className="flex flex-col gap-2 mt-2">
                      {msg.products.map((product) => (
                        <div key={product.id} className="bg-muted/40 border border-border rounded-lg p-2.5 hover:bg-muted/60 transition-colors">
                          <div className="flex gap-2 items-center">
                            <Link to={`/produto/${product.id}`} className="group flex flex-1 min-w-0 items-center gap-2">
                              <img src={product.image} alt={productEnglishName(product)} className="w-12 h-12 rounded object-cover shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">{productEnglishName(product)}</p>
                                <p className="text-[10px] text-muted-foreground">{product.category}</p>
                                <p className="text-[11px] font-bold text-primary mt-1">
                                  {formatPrice(fxConvert(effectiveYen(product, 'small'), getCurrencyByCountry(selectedCountry)), getCurrencyByCountry(selectedCountry))}
                                </p>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                            </Link>
                            <button
                              onClick={() => {
                                addToCart(product, 'small', 1);
                                toast.success(language === 'pt' ? `Adicionado: ${productEnglishName(product)}` : `Added: ${productEnglishName(product)}`);
                              }}
                              className="flex-shrink-0 bg-primary hover:bg-primary/95 text-white p-1.5 rounded-lg transition-colors"
                              title={t('kimiclaw.search.add_to_cart')}
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SHIPPING CALCULATION RESULTS */}
                  {msg.shippingResults && msg.shippingResults.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-2 text-[11px]">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-1 px-2 font-bold text-foreground text-[10px]">{t('kimiclaw.shipping.carrier')}</th>
                            <th className="text-right py-1 px-2 font-bold text-foreground text-[10px]">{t('kimiclaw.shipping.price')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {msg.shippingResults.map((option, idx) => (
                            <tr key={idx} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                              <td className="py-2 px-2 text-left text-foreground">
                                <div className="font-semibold">{option.carrier}</div>
                                {option.daysEstimate && (
                                  <div className="text-[10px] text-muted-foreground">~{option.daysEstimate} dias</div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right">
                                <div className="font-bold text-primary">
                                  {formatPrice(option.basePrice, option.currency)}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* STEP BY STEP OR TYPING STATE */}
            {isTyping && (
              <div className="flex gap-2.5">
                <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-primary shrink-0 self-end shadow-soft">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="max-w-[80%] space-y-2">
                  {currentSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="text-[11px] text-muted-foreground font-mono bg-muted/60 dark:bg-zinc-900/60 px-2.5 py-1 rounded border border-border/50 animate-pulse flex items-center gap-1.5"
                    >
                      <Loader2 className="w-3 h-3 animate-spin text-primary" />
                      {step}
                    </div>
                  ))}
                  <div className="bg-card text-card-foreground border border-border rounded-2xl rounded-bl-none px-3.5 py-2.5 text-xs inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* SKILL SUGGESTIONS */}
          {!isTyping && (
            <div className="px-4 py-2 border-t border-border bg-muted/30">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Command className="w-3 h-3" />
                {isAdmin
                  ? (language === 'pt' ? '⚡ Modo Admin' : '⚡ Admin Mode')
                  : (language === 'pt' ? 'Habilidades Rápidas' : 'Quick Agent Skills')}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto scrollbar-hide py-0.5">
                <button
                  onClick={() => handleSuggestionClick(t('kimiclaw.skill.search_products'), 'buscar produtos')}
                  className="text-[11px] bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-full px-2.5 py-1 text-primary-dark dark:text-primary font-bold flex items-center gap-1 transition-all duration-200"
                >
                  🔍 {language === 'pt' ? 'Buscar Produtos' : 'Search Products'}
                </button>
                {isAdmin ? (
                  <>
                    <button
                      onClick={() => handleSuggestionClick('Qual o faturamento desse mês?', 'faturamento')}
                      className="text-[11px] bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-full px-2.5 py-1 text-green-700 dark:text-green-400 font-bold flex items-center gap-1 transition-all duration-200"
                    >
                      📊 {language === 'pt' ? 'Faturamento' : 'Revenue'}
                    </button>
                    <button
                      onClick={() => handleSuggestionClick('Calcular frete do biore para Brasil', 'frete biore brasil')}
                      className="text-[11px] bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-full px-2.5 py-1 text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1 transition-all duration-200"
                    >
                      ⚖️ {language === 'pt' ? 'Frete por Produto' : 'Product Shipping'}
                    </button>
                    <button
                      onClick={() => handleSuggestionClick('Mostrar todos os produtos incluindo ocultos', 'mostrar produtos ocultos')}
                      className="text-[11px] bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-full px-2.5 py-1 text-amber-700 dark:text-amber-400 font-medium transition-all duration-200"
                    >
                      👁️ {language === 'pt' ? 'Ver Catálogo Completo' : 'Full Catalog'}
                    </button>
                    <button
                      onClick={() => handleSuggestionClick('Qual a margem do produto biore?', 'margem lucro produto')}
                      className="text-[11px] bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-full px-2.5 py-1 text-amber-700 dark:text-amber-400 font-medium transition-all duration-200"
                    >
                      📊 {language === 'pt' ? 'Margem/Custo' : 'Margin/Cost'}
                    </button>
                    <button
                      onClick={() => handleSuggestionClick(t('kimiclaw.skill.calc_shipping'), 'calcular frete')}
                      className="text-[11px] bg-card hover:bg-primary/10 border border-border hover:border-primary/30 rounded-full px-2.5 py-1 text-foreground transition-all duration-200"
                    >
                      📦 {language === 'pt' ? 'Frete Manual' : 'Manual Shipping'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleSuggestionClick(t('kimiclaw.skill.calc_shipping'), 'calcular frete')}
                      className="text-[11px] bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-full px-2.5 py-1 text-primary-dark dark:text-primary font-bold flex items-center gap-1 transition-all duration-200"
                    >
                      📦 {language === 'pt' ? 'Calcular Frete' : 'Calc. Shipping'}
                    </button>
                    <button
                      onClick={() => handleSuggestionClick(t('kimiclaw.skill.apply_coupon'), 'cupom')}
                      className="text-[11px] bg-card hover:bg-primary/10 border border-border hover:border-primary/30 rounded-full px-2.5 py-1 text-foreground transition-all duration-200"
                    >
                      {t('kimiclaw.skill.apply_coupon')}
                    </button>
                    <button
                      onClick={() => handleSuggestionClick('📱 Receber novidades no WhatsApp', 'enviar whatsapp')}
                      className="text-[11px] bg-card hover:bg-primary/10 border border-border hover:border-primary/30 rounded-full px-2.5 py-1 text-foreground flex items-center gap-1 transition-all duration-200"
                    >
                      <Smartphone className="w-3 h-3" />
                      {language === 'pt' ? 'WhatsApp' : 'WhatsApp'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleSuggestionClick(t('kimiclaw.skill.clear_cart'), 'limpar carrinho')}
                  className="text-[11px] bg-card hover:bg-destructive/10 border border-border hover:border-destructive/30 rounded-full px-2.5 py-1 text-destructive font-medium transition-all duration-200"
                >
                  {t('kimiclaw.skill.clear_cart')}
                </button>
              </div>
            </div>
          )}

          {/* INPUT FORM */}
          <form onSubmit={handleSendMessage} className="p-3 bg-card border-t border-border flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={t('kimiclaw.input_placeholder')}
                disabled={isTyping}
                className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2.5 pr-8 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground flex items-center gap-1 select-none pointer-events-none">
                <CornerDownLeft className="w-3.5 h-3.5 opacity-50" />
              </div>
            </div>
            <button
              type="submit"
              disabled={isTyping || !inputValue.trim()}
              className="p-2.5 rounded-lg bg-primary hover:bg-primary/95 text-white disabled:bg-muted disabled:text-muted-foreground transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default KimiClawAssistant;
