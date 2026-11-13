import React, { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import AdminPreviewBar from './AdminPreviewBar';
import { useBirthdayBonus } from '@/hooks/useBirthdayBonus';
import OrganizationJsonLd from '@/components/OrganizationJsonLd';

// Widget não-crítico (botão flutuante do WhatsApp): carregado sob demanda para manter o
// chunk compartilhado (Layout) leve. Ausência momentânea do botão não afeta
// o conteúdo principal da página — fallback null é apropriado aqui.
const FloatingWhatsAppWidget = lazy(() => import('../FloatingWhatsAppWidget'));

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  // O WhatsApp é o assistente flutuante do cliente — não aparece no painel admin
  const isAdminPage = useLocation().pathname.startsWith('/admin');
  useBirthdayBonus(); // concede 1000 pts no aniversário
  return (
    <div className="min-h-screen flex flex-col w-full max-w-full overflow-x-clip">
      <OrganizationJsonLd />
      <Header />
      {/* Mobile (< md): Header (64px) fica no topo, Sidebar é gaveta.
          Desktop (md+): Sidebar fica fixa à esquerda (w-64) e sempre visível,
          sem Header — conteúdo ganha padding-left equivalente no lugar do
          padding-top. Admin não usa a Sidebar (tem a própria aside). */}
      <main
        className={`flex-1 w-full max-w-full overflow-x-clip ${
          isAdminPage ? 'pt-20' : 'pt-16 md:pt-0 md:pl-64'
        }`}
      >
        {children}
      </main>
      <div className={isAdminPage ? '' : 'md:pl-64'}>
        <Footer />
      </div>
      {!isAdminPage && (
        <Suspense fallback={null}>
          <FloatingWhatsAppWidget />
        </Suspense>
      )}
      <AdminPreviewBar />
    </div>
  );
};

export default Layout;
