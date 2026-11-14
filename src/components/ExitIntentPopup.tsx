import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Download, Mail, CheckCircle2, Loader2, ShoppingBag, Gift } from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/hooks/use-toast';
import { newsletterService } from '@/services/newsletterService';
import { requestPsFeeWaiver } from '@/services/psFeeWaiverService';
import { checkoutPointsCoverage, psFeeWaiver } from '@/utils/psFeeWaiver';
import { safeStorage } from '@/utils/storage';
import { effectiveYen } from '@/utils/pricing';
import type { CartItem } from '@/types';
import { SIGNUP_POPUPS_ENABLED } from '@/config/featureFlags';
import { useLanguage } from '@/context/LanguageContext';

// A oferta de isenção da taxa PS ("reservar Personal Shopper") é o variant
// `ps_offer` abaixo — desativada junto com o popup de cadastro, mesmo pedido.
const PS_OFFER_POPUP_ENABLED = false;

const MARKETING_KEY = 'exit_popup_shown';      // oferta/guia/retenção simples — 1× por sessão
const WARN_KEY = 'exit_waiver_warn_shown';     // aviso de perda da isenção — 1× por sessão
const GUIDE_COOLDOWN_KEY = 'exit_intent_shown_at';
const GUIDE_COOLDOWN_DAYS = 14;
const MIN_TIME_ON_PAGE_MS = 6000;
// Tempo no toque antes de a oferta poder aparecer sozinha. Eram 35s: quem entrava
// e saía rápido — a maioria no celular — nunca chegava a ver a isenção da taxa.
const MOBILE_DWELL_MS = 25000;

// Funil de checkout = /checkout + /order-review (revisão/pagamento).
const inFunnel = (p: string): boolean => p.startsWith('/checkout') || p.startsWith('/order-review');
// Telas de autenticação. Reter aqui é contraproducente: o cliente já está
// convertendo, e fora do funil a variante é a `guide` — que pediria por popup
// justamente o e-mail que ele está digitando no formulário atrás dele.
const AUTH_ROUTES = ['/login', '/cadastro'];

type Variant = 'retention' | 'waiver_warning' | 'ps_offer' | 'guide';

const flagGet = (k: string): boolean => {
  try { return sessionStorage.getItem(k) === '1'; } catch { return false; }
};
const flagSet = (k: string): void => {
  try { sessionStorage.setItem(k, '1'); } catch { /* noop */ }
};

// Quantidade de itens que pagam taxa PS (¥1.000/un): exclui brindes e isentos (noPsFee).
const psFeeQtyOf = (list: CartItem[]): number =>
  list.reduce((s, i) => (i.freeGift || i.product?.noPsFee) ? s : s + i.quantity, 0);

// Subtotal da mercadoria em ¥ (exclui brindes): base dos pontos
const productSubtotalYenOf = (list: CartItem[]): number =>
  list.reduce((s, i) => i.freeGift ? s : s + effectiveYen(i.product, i.size) * i.quantity, 0);

// Moldura do modal (overlay + cartão + botão fechar). Definida no nível do módulo
// para NÃO remontar a subárvore a cada render (senão o input de e-mail perde o foco).
const Shell: React.FC<{ label: string; onClose: () => void; children: React.ReactNode }> = ({
  label,
  onClose,
  children,
}) => {
  const { t } = useLanguage();
  return (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200"
    role="dialog"
    aria-modal="true"
    aria-label={label}
  >
    <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
      <button
        onClick={onClose}
        aria-label={t('shell.close')}
        className="absolute right-3 top-3 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors z-10"
      >
        <X className="w-5 h-5" />
      </button>
      {children}
    </div>
  </div>
  );
};

/**
 * Popup de saída (exit-intent). Dispara NO MÁXIMO uma vez por sessão e NUNCA reabre
 * depois de fechado — acaba com a sensação de "vírus" de reaparecer toda hora.
 *
 * O conteúdo depende de onde o cliente está ao tentar sair:
 *  - /checkout com taxa PS e sem isenção ativa → oferta: finalize agora e a Taxa de
 *    Personal Shopper sai de graça (aceitar concede a isenção; ver utils/psFeeWaiver).
 *  - /checkout ou /order-review nos demais casos → lembrete para não abandonar o pedido.
 *  - FORA do checkout → a oferta de isenção NUNCA aparece (o cliente ainda pode estar
 *    escolhendo produtos). Só o guia por e-mail (lead) para visitante não logado,
 *    respeitando cooldown de 14 dias.
 *  - /login e /cadastro → NUNCA aparece: o cliente está no meio do cadastro.
 *
 * Desktop: detecta o mouse saindo pelo topo. Mobile: tempo na página + scroll.
 */
const ExitIntentPopup: React.FC = () => {
  const { isAuthenticated } = useUser();
  const { items } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<Variant>('guide');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [waiverLoading, setWaiverLoading] = useState(false);

  // Refs sempre atualizados para uso DENTRO dos listeners (evita stale closure).
  const itemsRef = useRef(items);
  const pathRef = useRef(location.pathname);
  const authRef = useRef(isAuthenticated);
  itemsRef.current = items;
  pathRef.current = location.pathname;
  authRef.current = isAuthenticated;

  // Evita abrir um segundo popup enquanto um já está aberto.
  const openRef = useRef(false);
  openRef.current = open;

  // Decide qual popup mostrar no momento da saída (lê dados frescos via refs).
  const resolveVariant = useCallback((): Variant | null => {
    const list = itemsRef.current;
    const path = pathRef.current;
    if (AUTH_ROUTES.some((rota) => path.startsWith(rota))) return null;
    // Dentro do funil de checkout (cliente já está finalizando).
    if (inFunnel(path)) {
      if (list.length === 0) return null;
      // Só na página de checkout (endereço), com taxa PS e sem isenção ativa,
      // oferecemos a isenção por finalizar agora. Caso contrário, retenção simples.
      // Ler pontos resgatados do storage (gravado antes de navegar para /order-review)
      const redeemPoints = Number(safeStorage.getItem('redeem_points')) || 0;
      const productSubtotalYen = productSubtotalYenOf(list);
      const pointsCoverAllProducts = checkoutPointsCoverage.coversAll()
        || (productSubtotalYen > 0 && redeemPoints > 0 && redeemPoints >= productSubtotalYen);
      // Só oferecemos a isenção da taxa PS se a mercadoria não for coberta por pontos
      if (PS_OFFER_POPUP_ENABLED && path.startsWith('/checkout') && psFeeQtyOf(list) > 0 && !psFeeWaiver.isActive() && !pointsCoverAllProducts) return 'ps_offer';
      return 'retention';
    }
    // FORA do checkout: NÃO oferecemos a isenção — o cliente ainda pode estar
    // escolhendo produtos. Só o guia por e-mail (lead) para visitante não logado.
    if (!SIGNUP_POPUPS_ENABLED) return null;
    if (authRef.current) return null;
    const last = Number(safeStorage.getItem(GUIDE_COOLDOWN_KEY) || 0);
    if (Date.now() - last <= GUIDE_COOLDOWN_DAYS * 86400000) return null;
    return 'guide';
  }, []);

  const trigger = useCallback(() => {
    if (openRef.current) return;                 // já há um popup aberto
    let v = resolveVariant();
    if (!v) return;
    // No checkout com isenção ativa, o lembrete vira AVISO de perda da isenção.
    if (v === 'retention' && psFeeWaiver.isActive()) v = 'waiver_warning';

    if (v === 'waiver_warning') {
      if (flagGet(WARN_KEY)) return;             // aviso 1× por sessão (chave própria)
      flagSet(WARN_KEY);
    } else {
      if (flagGet(MARKETING_KEY)) return;        // oferta/guia/retenção 1× por sessão
      flagSet(MARKETING_KEY);
      if (v === 'guide') safeStorage.setItem(GUIDE_COOLDOWN_KEY, String(Date.now()));
    }
    setVariant(v);
    setOpen(true);
  }, [resolveVariant]);

  useEffect(() => {
    const start = Date.now();

    const onMouseOut = (e: MouseEvent) => {
      if (Date.now() - start < MIN_TIME_ON_PAGE_MS) return;
      if (e.clientY <= 0 && !e.relatedTarget) trigger();
    };

    const isTouch = window.matchMedia('(hover: none)').matches;
    let mobileTimer: ReturnType<typeof setTimeout> | null = null;
    let scrolled = false;
    const onScroll = () => { scrolled = true; };

    // No toque não existe "mouse saindo pela borda", então o sinal de saída é
    // outro: o gesto/botão VOLTAR. É o que a pessoa aperta para abandonar a
    // página, e é o momento exato em que a oferta faz sentido.
    //
    // A âncora empilhada é o que permite ver o voltar sem levar o cliente para
    // fora: o primeiro voltar consome esse estado extra, cai aqui e abre o
    // popup; se ele apertar voltar de novo, sai normalmente. Uma interceptação
    // só, e apenas enquanto a oferta ainda não foi mostrada nesta sessão.
    let ancoraArmada = false;
    const onPopState = () => {
      if (!ancoraArmada) return;
      ancoraArmada = false;
      trigger();
    };

    if (isTouch) {
      window.addEventListener('scroll', onScroll, { passive: true });
      // 25s (era 35s): tempo demais deixava a maioria sair antes de ver a oferta.
      mobileTimer = setTimeout(() => { if (scrolled) trigger(); }, MOBILE_DWELL_MS);
      try {
        window.history.pushState({ jeExitAnchor: true }, '');
        ancoraArmada = true;
        window.addEventListener('popstate', onPopState);
      } catch {
        /* history bloqueado — segue só com o timer */
      }
    } else {
      document.addEventListener('mouseout', onMouseOut);
    }

    return () => {
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('popstate', onPopState);
      clearTimeout(mobileTimer);
    };
  }, [trigger]);

  // Sair do funil de checkout sem finalizar invalida a isenção: ela vale só para
  // fechamento imediato. Progredir /checkout → /order-review NÃO invalida.
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const prev = prevPathRef.current;
    const cur = location.pathname;
    if (inFunnel(prev) && !inFunnel(cur)) {
      psFeeWaiver.clear();
      checkoutPointsCoverage.clear();
    }
    prevPathRef.current = cur;
  }, [location.pathname]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // A tela só considera a oferta ativa depois que o servidor devolve uma
  // autorização assinada. Assim o total exibido é o mesmo que a API cobrará.
  const acceptPsOffer = useCallback(async () => {
    if (waiverLoading) return;
    setWaiverLoading(true);
    try {
      const issued = await requestPsFeeWaiver();
      if (!psFeeWaiver.grant(issued.token, issued.expiresAt)) throw new Error(t('exit.error.save'));
      close();
      if (!inFunnel(location.pathname)) navigate('/checkout');
    } catch (error) {
      toast({
        title: t('exit.toast.waiverError'),
        description: error instanceof Error ? error.message : t('profile.error.retry'),
        variant: 'destructive',
      });
    } finally {
      setWaiverLoading(false);
    }
  }, [close, location.pathname, navigate, toast, waiverLoading, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      toast({ title: t('exit.toast.invalidTitle'), description: t('exit.toast.invalidDesc') });
      return;
    }
    setStatus('loading');
    await newsletterService.capture({ email: value, source: 'exit_intent' });
    setStatus('done');
    setTimeout(() => setOpen(false), 2500);
  };

  if (!open) return null;

  const psFeeQty = psFeeQtyOf(items);
  const psFeeYen = psFeeQty * 1000;

  // ----- Ponto 1: retenção no checkout -----
  if (variant === 'retention') {
    return (
      <Shell label={t('exit.retention.label')} onClose={close}>
        <div className="bg-gradient-to-br from-purple-600 to-amber-500 p-6 text-center text-white">
          <ShoppingBag className="w-10 h-10 mx-auto mb-2" />
          <h2 className="text-xl font-black leading-tight">{t('exit.retention.title')}</h2>
          <p className="text-sm text-white/90 mt-1">
            {t('exit.retention.desc')}
          </p>
        </div>
        <div className="p-6 space-y-3">
          <button
            onClick={close}
            className="w-full bg-gradient-to-r from-purple-600 to-amber-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            {t('exit.retention.back')}
          </button>
          <p className="text-xs text-center text-gray-400">{t('exit.retention.kept')}</p>
        </div>
      </Shell>
    );
  }

  // ----- Aviso: sair do checkout invalida a isenção já aceita -----
  if (variant === 'waiver_warning') {
    return (
      <Shell label={t('exit.warn.label')} onClose={close}>
        <div className="bg-gradient-to-br from-purple-600 to-amber-500 p-6 text-center text-white">
          <Gift className="w-10 h-10 mx-auto mb-2" />
          <h2 className="text-xl font-black leading-tight">{t('exit.warn.title')}</h2>
          <p className="text-sm text-white/90 mt-1">
            {t('exit.warn.body').replace('{fee}', psFeeYen > 0 ? t('exit.warn.feeAmount').replace('{valor}', psFeeYen.toLocaleString()) : '')}
          </p>
        </div>
        <div className="p-6 space-y-3">
          <button
            onClick={close}
            className="w-full bg-gradient-to-r from-purple-600 to-amber-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            {t('exit.warn.back')}
          </button>
          <p className="text-xs text-center text-gray-400">{t('exit.warn.note')}</p>
        </div>
      </Shell>
    );
  }

  // ----- Ponto 2: oferta de isenção da taxa PS fora do checkout -----
  if (variant === 'ps_offer') {
    return (
      <Shell label={t('exit.ps.label')} onClose={close}>
        <div className="bg-gradient-to-br from-purple-600 to-amber-500 p-6 text-center text-white">
          <Gift className="w-10 h-10 mx-auto mb-2" />
          <h2 className="text-xl font-black leading-tight">{t('exit.ps.title')}</h2>
          <p className="text-sm text-white/90 mt-1">
            {t('exit.ps.body').replace('{fee}', psFeeYen > 0 ? t('exit.warn.feeAmount').replace('{valor}', psFeeYen.toLocaleString()) : '')}
          </p>
        </div>
        <div className="p-6 space-y-3">
          <button
            onClick={acceptPsOffer}
            disabled={waiverLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-amber-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {waiverLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('exit.ps.loading')}</>
              : psFeeYen > 0 ? t('exit.ps.ctaSave').replace('{valor}', psFeeYen.toLocaleString()) : t('exit.ps.cta')}
          </button>
          <button
            onClick={close}
            className="w-full text-sm text-gray-500 dark:text-gray-400 font-medium py-2 hover:underline"
          >
            {t('exit.notNow')}
          </button>
          <p className="text-xs text-center text-gray-400">
            {t('exit.ps.note')}
          </p>
        </div>
      </Shell>
    );
  }

  // ----- Fallback: cadastro com pontos e cupons (só não-logados) -----
  // Função simples (NÃO useCallback): está após early-returns condicionais, então
  // um hook aqui violaria as Regras dos Hooks e quebraria o componente ao abrir.
  const handleCadastro = () => {
    close();
    navigate('/cadastro');
  };

  return (
    <Shell label={t('exit.guide.label')} onClose={close}>
      <div className="bg-gradient-to-br from-purple-600 to-amber-500 p-6 text-center text-white">
        <Gift className="w-10 h-10 mx-auto mb-2" />
        <h2 className="text-xl font-black leading-tight">
          {t('exit.guide.title')}
        </h2>
        <p className="text-sm text-white/90 mt-1">
          {t('exit.guide.desc')}
        </p>
      </div>
      <div className="p-6 space-y-3">
        <button
          onClick={handleCadastro}
          className="w-full bg-gradient-to-r from-purple-600 to-amber-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          {t('exit.guide.cta')}
        </button>
        <button
          onClick={close}
          className="w-full text-sm text-gray-500 dark:text-gray-400 font-medium py-2 hover:underline"
        >
          {t('exit.notNow')}
        </button>
        <p className="text-xs text-center text-gray-400">{t('exit.guide.note')}</p>
      </div>
    </Shell>
  );
};

export default ExitIntentPopup;
