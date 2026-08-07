import React, { Suspense, lazy, useEffect } from "react";
import { SmoothScroll } from '@/lib/smoothScroll';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { CartProvider } from "@/context/CartContext";
import { UserProvider } from "@/context/UserContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ProductsProvider } from "@/context/ProductsContext";
import { firebaseConfigReady, firebaseConfigSource } from "@/config/firebase";
import { initAnalytics, trackPageview } from "@/lib/analytics";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { ADMIN_EMAIL, ADMIN_USER_ID } from "@/config/admin";
import ScrollToTop from "./components/ScrollToTop";
import { referralService } from "@/services/referralService";
import ErrorBoundary from "./components/ErrorBoundary";
import { useSeo } from "@/hooks/useSeo";
import RequireAdmin from "./components/RequireAdmin";
import CookieBanner from "./components/CookieBanner";
import InstallPrompt from "./components/InstallPrompt";
import ExitIntentPopup from "./components/ExitIntentPopup";
import CartAbandonmentTracker from "./components/CartAbandonmentTracker";
import CartRecoveryBanner from "./components/CartRecoveryBanner";
import PushSubscriptionSync from "./components/PushSubscriptionSync";
import AnimatedPlaneLogo from "./components/AnimatedPlaneLogo";
import MaintenancePage from "./pages/Maintenance";
import RouteLoader from "./components/RouteLoader";

// Code splitting: cada página carregada apenas quando necessária
const Index            = lazy(() => import("./pages/Index"));
const Products         = lazy(() => import("./pages/Products"));
const Cart             = lazy(() => import("./pages/Cart"));
const Checkout         = lazy(() => import("./pages/Checkout"));
const OrderReview      = lazy(() => import("./pages/OrderReview"));
const OrderConfirmation= lazy(() => import("./pages/OrderConfirmation"));
const Register         = lazy(() => import("./pages/Register"));
const Login            = lazy(() => import("./pages/Login"));
const Profile          = lazy(() => import("./pages/Profile"));
const Shipping         = lazy(() => import("./pages/Shipping"));
const Offers           = lazy(() => import("./pages/Offers"));
const HowItWorks       = lazy(() => import("./pages/HowItWorks"));
const About            = lazy(() => import("./pages/About"));
const Vlog             = lazy(() => import("./pages/Vlog"));
const Admin            = lazy(() => import("./pages/Admin"));
const Wishlist         = lazy(() => import("./pages/Wishlist"));
const TrackOrder       = lazy(() => import("./pages/TrackOrder"));
const ProductDetail    = lazy(() => import("./pages/ProductDetail"));
const AffiliatePage    = lazy(() => import("./pages/Affiliate"));
const CustomRequest    = lazy(() => import("./pages/CustomRequest"));
const Business         = lazy(() => import("./pages/Business"));
const NotFound         = lazy(() => import("./pages/NotFound"));
const PrivacyPolicy    = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService   = lazy(() => import("./pages/TermsOfService"));
const CookiePolicy     = lazy(() => import("./pages/CookiePolicy"));
const ReturnPolicy     = lazy(() => import("./pages/ReturnPolicy"));
const FirebaseSync     = lazy(() => import("./pages/FirebaseSync"));
const SyncData         = lazy(() => import("./pages/SyncData"));
const Promotion        = lazy(() => import("./pages/Promotion"));
const Sorteio          = lazy(() => import("./pages/Sorteio"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5 * 60 * 1000 },
  },
});

// Analytics de conversão (GA4 + Meta Pixel) só carrega após consentimento —
// ver src/lib/analytics.ts. A contagem de visitas interna (anônima, agregada,
// sem dados pessoais, usada só no dashboard admin) roda para TODOS os
// visitantes — não depende do banner de cookies.
const AnalyticsLoader: React.FC = () => {
  const { consent } = useCookieConsent();
  const location = useLocation();

  // GA4 (Firebase Analytics) + Meta Pixel — só com consentimento explícito.
  useEffect(() => {
    if (consent !== 'accepted') return;
    initAnalytics();
  }, [consent]);

  // Contagem de visitas + país/cidade — para todos (estatística agregada anônima)
  useEffect(() => {
    import('@/services/visitorService').then(({ visitorService }) => {
      visitorService.trackVisit().catch(() => {});
    });
  }, []);

  // Rastreia visualização de página a cada mudança de rota (interno + GA4/Meta)
  useEffect(() => {
    import('@/services/visitorService').then(({ visitorService }) => {
      visitorService.trackPage(location.pathname).catch(() => {});
    });
    trackPageview(location.pathname);
  }, [location.pathname]);

  return null;
};

// SEO centralizado: título/descrição/OG por rota estática.
// Páginas de produto (/produto/:id) são tratadas pelo próprio ProductDetail (useSeo).
const STATIC_ROUTE_META: Array<{ match: string; title: string; description: string }> = [
  { match: '/produtos', title: 'Produtos Importados do Japão | NikkeyBox', description: 'Cosméticos, doces, papelaria e acessórios originais do Japão. Envio direto com frete calculado por peso real.' },
  { match: '/ofertas', title: 'Ofertas e Promoções | NikkeyBox', description: 'Promoções relâmpago e descontos em produtos japoneses importados. Aproveite enquanto durarem os estoques.' },
  { match: '/frete', title: 'Frete e Prazos de Envio | NikkeyBox', description: 'Simule o frete e o prazo de envio do Japão para o seu país. Cálculo por peso real, conforme Japan Post.' },
  { match: '/como-funciona', title: 'Como Funciona | NikkeyBox', description: 'Passo a passo de como comprar produtos originais do Japão com segurança, rastreamento e envio internacional.' },
  { match: '/sobre', title: 'Sobre a NikkeyBox', description: 'Conheça a NikkeyBox: importação direta do Japão, produtos originais e atendimento cuidadoso.' },
  { match: '/favoritos', title: 'Meus Favoritos | NikkeyBox', description: 'Sua lista de produtos japoneses favoritos, salva para comprar depois.' },
  { match: '/empresas', title: 'Vendas para Empresas | NikkeyBox', description: 'Importação de produtos japoneses para empresas, lojas e revenda.' },
  { match: '/faca-seu-pedido', title: 'Faça Seu Pedido | NikkeyBox', description: 'Não encontrou o produto japonês que procura? Peça sob encomenda.' },
  { match: '/afiliado', title: 'Programa de Afiliados | NikkeyBox', description: 'Ganhe comissões indicando produtos japoneses importados para seus seguidores.' },
  { match: '/rastrear', title: 'Rastrear Pedido | NikkeyBox', description: 'Acompanhe o status e o rastreio do seu pedido enviado do Japão.' },
  { match: '/promocao', title: 'Promoção em Destaque | NikkeyBox', description: 'Oferta especial em produtos japoneses selecionados. Tempo limitado.' },
  { match: '/vlog', title: 'Vlog do Japão | NikkeyBox', description: 'Vídeos e bastidores direto do Japão: cultura, produtos e novidades.' },
  { match: '/privacidade', title: 'Política de Privacidade | NikkeyBox', description: 'Como coletamos e tratamos os seus dados pessoais na NikkeyBox.' },
  { match: '/termos', title: 'Termos de Serviço | NikkeyBox', description: 'Termos e condições de uso e compra na loja NikkeyBox.' },
  { match: '/cookies', title: 'Política de Cookies | NikkeyBox', description: 'Saiba como usamos cookies na NikkeyBox e como gerenciar seu consentimento.' },
  { match: '/devolucao', title: 'Política de Devolução e Troca | NikkeyBox', description: 'Regras de devolução, troca e reembolso de produtos importados.' },
];

const RouteMeta: React.FC = () => {
  const location = useLocation();
  const p = location.pathname;
  // /produto/* → o ProductDetail define título/imagem do produto. Aqui não mexemos.
  const meta = STATIC_ROUTE_META.find(r => p === r.match || p.startsWith(r.match + '/'));
  useSeo(meta ? { title: meta.title, description: meta.description, canonicalPath: p } : {});
  return null;
};

// Rotas sempre acessíveis mesmo em manutenção
const OPEN_PATHS = ['/admin', '/login', '/firebase-sync', '/sync-data'];

// Verifica se há um admin logado via localStorage (sem precisar do UserProvider)
const isAdminLoggedIn = (): boolean => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return false;
    const u = JSON.parse(raw);
    return u?.id === ADMIN_USER_ID || u?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  } catch { return false; }
};

// Captura referral da URL uma vez ao montar
const ReferralCapture: React.FC = () => {
  useEffect(() => { referralService.captureReferral(); }, []);
  return null;
};

// Shell da app com providers pesados — só monta se NÃO estiver em manutenção
const FullApp: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <UserProvider>
      <ProductsProvider>
      <CartProvider>
        <TooltipProvider>
          {!firebaseConfigReady && (
            <div className="bg-red-600 text-white text-sm text-center py-2 px-4">
              Firebase não configurado. Verifique as variáveis VITE_FIREBASE_* no Vercel e faça redeploy.
            </div>
          )}
          <AnalyticsLoader />
          <RouteMeta />
          <ReferralCapture />
          <Toaster />
          <Sonner />
          <ScrollToTop />
          <SmoothScroll>
          <ErrorBoundary>
            <Suspense fallback={<RouteLoader />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/produtos" element={<Products />} />
                <Route path="/produtos/:category" element={<Products />} />
                <Route path="/produto/:id" element={<ProductDetail />} />
                <Route path="/carrinho" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/order-review" element={<OrderReview />} />
                <Route path="/order-confirmation" element={<OrderConfirmation />} />
                <Route path="/cadastro" element={<Register />} />
                <Route path="/login" element={<Login />} />
                <Route path="/perfil" element={<Profile />} />
                <Route path="/frete" element={<Shipping />} />
                <Route path="/ofertas" element={<Offers />} />
                <Route path="/como-funciona" element={<HowItWorks />} />
                <Route path="/sobre" element={<About />} />
                <Route path="/vlog" element={<Vlog />} />
                <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
                <Route path="/favoritos" element={<Wishlist />} />
                <Route path="/afiliado" element={<AffiliatePage />} />
                <Route path="/faca-seu-pedido" element={<CustomRequest />} />
                <Route path="/empresas" element={<Business />} />
                <Route path="/rastrear" element={<TrackOrder />} />
                <Route path="/firebase-sync" element={<RequireAdmin><FirebaseSync /></RequireAdmin>} />
                <Route path="/sync-data" element={<RequireAdmin><SyncData /></RequireAdmin>} />
                <Route path="/privacidade" element={<PrivacyPolicy />} />
                <Route path="/termos" element={<TermsOfService />} />
                <Route path="/cookies" element={<CookiePolicy />} />
                <Route path="/return-policy" element={<ReturnPolicy />} />
                <Route path="/devolucao" element={<ReturnPolicy />} />
                <Route path="/promocao" element={<Promotion />} />
                <Route path="/sorteio" element={<Sorteio />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
          </SmoothScroll>
          <ExitIntentPopup />
          <CartAbandonmentTracker />
          <CartRecoveryBanner />
          <PushSubscriptionSync />
        </TooltipProvider>
      </CartProvider>
      </ProductsProvider>
    </UserProvider>
  </QueryClientProvider>
);

// Camada de manutenção: decide o que renderizar ANTES de montar providers pesados
// Tela leve exibida na primeira visita ever (sem cache).
// Zero Firebase, zero providers pesados — apenas logo + fundo enquanto o fetch REST (~1.5s) confirma o estado.
const CheckingScreen: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-b from-pink-100 via-pink-50 to-white flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <AnimatedPlaneLogo size={80} className="shadow-lg" imageClassName="scale-[0.64] rounded-full" />
      <div className="flex gap-1.5">
        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  </div>
);

const MaintenanceShell: React.FC = () => {
  const { isEnabled, loading } = useMaintenanceMode();
  const location = useLocation();
  const isOpenPath = OPEN_PATHS.some(
    p => location.pathname === p || location.pathname.startsWith(p + '/')
  );

  // Admin e rotas de admin sempre veem o app completo (mesmo em manutenção)
  if (isOpenPath || isAdminLoggedIn()) return <FullApp />;

  // Manutenção confirmada (cache instantâneo ou fetch concluído)
  if (isEnabled) return <MaintenancePage />;

  // Primeira visita sem cache: mostra tela leve enquanto o fetch confirma (máx 1.5s)
  if (loading) return <CheckingScreen />;

  // Site normal
  return <FullApp />;
};

// CookieBanner e InstallPrompt ficam FORA do MaintenanceShell — aparecem em qualquer estado
const App = () => (
  <BrowserRouter>
    <LanguageProvider>
      <CookieBanner />
      <InstallPrompt />
      <MaintenanceShell />
    </LanguageProvider>
  </BrowserRouter>
);

export default App;
