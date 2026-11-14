import React, { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Heart, Search, ShieldCheck, ShoppingCart, UserCircle, X } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useProducts } from '@/context/ProductsContext';
import { categoryService, DEFAULT_CATEGORIES, type ProductCategory } from '@/services/categoryService';
import { cn } from '@/lib/utils';

export const SIDEBAR_WIDTH_PX = 256; // w-64 — usado pelo Layout para o padding do conteúdo

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Lockup da marca em UMA linha — nunca quebra "Nikkey / Box". */
export const BrandLockup: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn('whitespace-nowrap font-display text-lg font-semibold tracking-tight text-foreground', className)}>
    Nikkey<span className="text-primary">Box</span>
  </span>
);

const rowClass = (active: boolean) =>
  cn(
    'flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
  );

/**
 * Navegação da loja.
 * Desktop (md+): barra fixa à esquerda (o Layout dá `md:pl-64` ao conteúdo).
 * Mobile: gaveta com foco preso, Esc fecha e o foco volta ao botão que abriu.
 */
const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const { totalItems } = useCart();
  const { isAuthenticated, user, isAdmin } = useUser();
  const { t } = useLanguage();
  const { products } = useProducts();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);

  const [allCategories, setAllCategories] = React.useState<ProductCategory[]>(DEFAULT_CATEGORIES);
  useEffect(() => {
    categoryService.getAll().then(setAllCategories).catch(() => {});
  }, []);
  const categoriesWithProducts = allCategories.filter((c) => products.some((p) => !p.hidden && p.category === c.id));

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isAdminPage = location.pathname.startsWith('/admin');

  // Gaveta: trava o scroll, prende o foco e devolve ao gatilho ao fechar.
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      trigger?.focus?.();
    };
  }, [open, onClose]);

  // Fecha a gaveta (mobile) automaticamente ao navegar.
  useEffect(() => { onClose(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const navItems = [
    { label: t('nav.products'), href: '/produtos' },
    { label: t('nav.offers'), href: '/ofertas' },
    { label: t('nav.shipping'), href: '/frete' },
    { label: t('nav.howItWorks'), href: '/como-funciona' },
    { label: t('nav.customRequest'), href: '/faca-seu-pedido' },
    { label: t('nav.business'), href: '/empresas' },
    { label: t('nav.about'), href: '/sobre' },
  ];

  // Navegação SPA: antes era `window.location.href`, que recarregava o app
  // inteiro (e o catálogo) a cada busca.
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    const base = selectedCategory !== 'all' ? `/produtos/${selectedCategory}` : '/produtos';
    navigate(`${base}?q=${encodeURIComponent(q)}`);
  };

  const content = (inDrawer: boolean) => (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Link to="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('shell.home.aria')}>
          <BrandLockup />
        </Link>
        {inDrawer && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('shell.menu.close')}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {!isAdminPage && (
        <form onSubmit={handleSearch} role="search" className="mb-6">
          <label htmlFor={inDrawer ? 'sidebar-search-m' : 'sidebar-search'} className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t('nav.search').replace(/\.+$/, '')}
          </label>
          <div className="flex h-11 overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
            <span className="flex items-center pl-3 text-muted-foreground" aria-hidden="true"><Search className="h-4 w-4" /></span>
            <input
              id={inDrawer ? 'sidebar-search-m' : 'sidebar-search'}
              type="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
          </div>
          {categoriesWithProducts.length > 1 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label={t('sidebar.category')}
              className="mt-2 h-9 w-full cursor-pointer rounded-lg border border-input bg-background px-2 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">{t('sidebar.allCategories')}</option>
              {categoriesWithProducts.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          )}
        </form>
      )}

      {!isAdminPage && (
        <nav className="mb-6 flex flex-col gap-0.5" aria-label={t('shell.menu.main')}>
          {navItems.map((item) => (
            <Link key={item.href} to={item.href} aria-current={isActive(item.href) ? 'page' : undefined} className={rowClass(isActive(item.href))}>
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-4">
        {!isAdminPage && isAuthenticated && (
          <Link to="/favoritos" className={rowClass(isActive('/favoritos'))}>
            <Heart className="h-4 w-4" aria-hidden="true" /> {t('nav.favorites')}
          </Link>
        )}
        {!isAdminPage && (
          <Link to="/carrinho" className={rowClass(isActive('/carrinho'))}>
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            {t('nav.cart')}
            {totalItems > 0 && (
              <span className="ml-auto min-w-6 rounded-md bg-primary px-1.5 text-center text-xs font-semibold leading-6 text-primary-foreground tabular-nums">
                {totalItems}
              </span>
            )}
          </Link>
        )}
        <Link to={isAuthenticated ? '/perfil' : '/cadastro'} className={rowClass(isActive('/perfil') || isActive('/cadastro'))}>
          <UserCircle className="h-4 w-4" aria-hidden="true" />
          {isAuthenticated ? (user?.name?.split(' ')[0] || t('nav.profile')) : t('nav.register')}
        </Link>
        {isAdmin && (
          <Link to={isAdminPage ? '/' : '/admin'} className={cn(rowClass(false), 'text-primary hover:text-primary')}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {isAdminPage ? t('sidebar.viewStore') : t('nav.admin')}
          </Link>
        )}
      </div>
    </>
  );

  const duration = reduceMotion ? 0 : 0.2;

  return (
    <>
      {!isAdminPage && (
        <aside
          className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto border-r border-border bg-background px-5 py-6 md:flex"
          aria-label={t('shell.menu.label')}
        >
          {content(false)}
        </aside>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration, ease: 'easeOut' } }}
              exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.15, ease: 'easeIn' } }}
              onClick={onClose}
              className="fixed inset-0 z-[60] bg-black/50 md:hidden"
              aria-hidden
            />
            <motion.aside
              key="sidebar-panel"
              ref={panelRef}
              initial={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
              animate={reduceMotion ? { opacity: 1, transition: { duration: 0 } } : { x: 0, transition: { duration, ease: [0, 0, 0.2, 1] } }}
              exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { x: '-100%', transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }}
              className="fixed inset-y-0 left-0 z-[70] flex w-[86vw] max-w-sm flex-col overflow-y-auto border-r border-border bg-background px-5 py-5 md:hidden"
              role="dialog"
              aria-modal="true"
              aria-label={t('shell.menu.label')}
            >
              {content(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
