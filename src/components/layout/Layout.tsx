import React, { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import AdminPreviewBar from './AdminPreviewBar';
import { useBirthdayBonus } from '@/hooks/useBirthdayBonus';
import OrganizationJsonLd from '@/components/OrganizationJsonLd';

// Widget não-crítico (chat flutuante): carregado sob demanda para manter o
// chunk compartilhado (Layout) leve. Ausência momentânea do botão não afeta
// o conteúdo principal da página — fallback null é apropriado aqui.
const KimiClawAssistant = lazy(() => import('../KimiClawAssistant'));

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  // KimiClaw é assistente do cliente — não aparece no painel admin
  const isAdminPage = useLocation().pathname.startsWith('/admin');
  useBirthdayBonus(); // concede 1000 pts no aniversário
  return (
    <div className="min-h-screen flex flex-col w-full max-w-full overflow-x-clip">
      <OrganizationJsonLd />
      <Header />
      {/* Cliente mobile: barra de confiança (~28px) + topo (80px) = 108px.
          Desktop também inclui a navegação (~32px), totalizando ~140px.
          overflow-x-clip contém efeitos 3D sem criar um novo scroll container. */}
      <main className={`flex-1 w-full max-w-full overflow-x-clip ${isAdminPage ? 'pt-20' : 'pt-[108px] md:pt-[140px]'}`}>
        {children}
      </main>
      <Footer />
      {!isAdminPage && (
        <Suspense fallback={null}>
          <KimiClawAssistant />
        </Suspense>
      )}
      <AdminPreviewBar />
    </div>
  );
};

export default Layout;
