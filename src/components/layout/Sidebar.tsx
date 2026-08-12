import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, X, UserCircle, Heart, Search } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useProducts } from '@/context/ProductsContext';
import { categoryService, DEFAULT_CATEGORIES, type ProductCategory } from '@/services/categoryService';
import { cn } from '@/lib/utils';
import CountrySwitcher from '@/components/CountrySwitcher';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Barra lateral que concentra toda a navegação/ações que antes viviam no
 * header (busca, links, favoritos, carrinho, conta, admin, país/moeda).
 * O header passou a ter só a logo + o botão que abre esta barra.
 */
const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const { totalItems } = useCart();
  const { isAuthenticated, user, isAdmin } = useUser();
  const { t } = useLanguage();
  const { products } = useProducts();
  const location = useLocation();

  const [allCategories, setAllCategories] = React.useState<ProductCategory[]>(DEFAULT_CATEGORIES);
  useEffect(() => {
    categoryService.getAll().then(setAllCategories).catch(() => {});
  }, []);
  const categoriesWithProducts = allCategories.filter(
    (c) => products.some((p) => !p.hidden && p.category === c.id)
  );

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isAdminPage = location.pathname.startsWith('/admin');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Fecha a barra automaticamente ao navegar.
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const url = selectedCategory !== 'all' ? `/produtos/${selectedCategory}?q=${encodeURIComponent(searchQuery)}` : `/produtos?q=${encodeURIComponent(searchQuery)}`;
      window.location.href = url;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            aria-hidden
          />
          <motion.aside
            key="sidebar-panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed inset-y-0 left-0 z-[70] flex w-[86vw] max-w-sm flex-col overflow-y-auto border-r border-border bg-background px-6 py-6"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="font-brand text-lg font-black tracking-tight text-foreground">
                Nikkey<span className="text-primary">Box</span>
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar menu"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!isAdminPage && (
              <form onSubmit={handleSearch} className="mb-6 flex gap-2 overflow-hidden rounded-xl border border-border bg-secondary/40">
                <input
                  type="text"
                  placeholder={t('nav.search') || 'Buscar...'}
                  aria-label={t('nav.search') || 'Buscar produtos'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  aria-label={t('nav.products.all') || 'Categoria'}
                  className="cursor-pointer border-l border-border bg-transparent px-2 text-xs outline-none"
                >
                  <option value="all">{t('nav.products.all') || 'Todos'}</option>
                  {categoriesWithProducts.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                </select>
                <button type="submit" className="flex items-center justify-center bg-primary px-3 text-primary-foreground" aria-label={t('nav.search') || 'Buscar'}>
                  <Search className="h-4 w-4" />
                </button>
              </form>
            )}

            {!isAdminPage && (
              <nav className="mb-6 flex flex-col gap-1" aria-label="Navegação principal">
                {navItems.map((item) => (
                  <Link
                    key={item.label}
                    to={item.href}
                    className={cn(
                      'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive(item.href) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}

            <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
              {!isAdminPage && isAuthenticated && (
                <Link to="/favoritos" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/70 hover:text-foreground">
                  <Heart className="h-4 w-4" /> {t('nav.favorites')}
                </Link>
              )}
              {!isAdminPage && (
                <Link to="/carrinho" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/70 hover:text-foreground">
                  <ShoppingCart className="h-4 w-4" />
                  {t('nav.cart') || 'Carrinho'}
                  {totalItems > 0 && (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {totalItems}
                    </span>
                  )}
                </Link>
              )}
              <Link to={isAuthenticated ? '/perfil' : '/cadastro'} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/70 hover:text-foreground">
                <UserCircle className="h-4 w-4" />
                {isAuthenticated ? (user?.name?.split(' ')[0] || t('nav.profile')) : t('nav.register')}
              </Link>
              {isAdmin && (
                <Link to={isAdminPage ? '/' : '/admin'} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10">
                  <UserCircle className="h-4 w-4" />
                  {isAdminPage ? 'Ver Loja' : t('nav.admin')}
                </Link>
              )}
              {!isAdminPage && (
                <div className="pt-2">
                  <CountrySwitcher />
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default Sidebar;
