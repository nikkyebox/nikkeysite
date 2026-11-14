import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, ShoppingCart } from 'lucide-react';
import Sidebar, { BrandLockup } from './Sidebar';
import { useCart } from '@/context/CartContext';
import { useLanguage } from '@/context/LanguageContext';

/**
 * Header do mobile (< md): marca, carrinho e menu. Carrinho fica a um toque —
 * antes ficava escondido dentro da gaveta. A partir de md a Sidebar é fixa.
 */
const Header: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const { t } = useLanguage();
  const { totalItems } = useCart();

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background md:hidden">
        <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4">
          <Link to="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('shell.home.aria')}>
            <BrandLockup className="text-xl" />
          </Link>

          <div className="flex items-center gap-1">
            <Link
              to="/carrinho"
              aria-label={totalItems > 0 ? `${t('nav.cart')} (${totalItems})` : t('nav.cart')}
              className="relative flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {totalItems > 0 && (
                <span className="absolute right-1 top-1 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-semibold leading-5 text-primary-foreground tabular-nums" aria-hidden="true">
                  {totalItems}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              aria-label={t('shell.menu.open')}
              aria-expanded={isSidebarOpen}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <Sidebar open={isSidebarOpen} onClose={closeSidebar} />
    </>
  );
};

export default Header;
