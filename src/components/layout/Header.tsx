import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, Menu, X, ChevronDown, UserCircle, Heart, Lock, Package, ShieldCheck as ShieldCheckIcon, Plane, Search } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useProducts } from '@/context/ProductsContext';
import { categoryService, DEFAULT_CATEGORIES, type ProductCategory } from '@/services/categoryService';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import CountrySwitcher from '@/components/CountrySwitcher';
import { useToast } from '@/hooks/use-toast';
import { useSiteSettings } from '@/hooks/useSiteSettings';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { totalItems } = useCart();
  const { isAuthenticated, user, isAdmin } = useUser();
  const { t, selectedCountry } = useLanguage();
  const { products } = useProducts();
  const location = useLocation();
  const { settings } = useSiteSettings();

  // Categorias para o submenu — só as que têm produto visível cadastrado
  const [allCategories, setAllCategories] = useState<ProductCategory[]>(DEFAULT_CATEGORIES);
  useEffect(() => {
    categoryService.getAll().then(setAllCategories).catch(() => {});
  }, []);
  const categoriesWithProducts = allCategories.filter(
    (c) => products.some((p) => !p.hidden && p.category === c.id)
  );

  useEffect(() => {
    if (!isMoreOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMoreOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreOpen]);

  // Itens primários: sempre visíveis a partir de md. Secundários: agrupados em
  // "Mais" entre md e lg (faixa "intermediária" apertada) e inline a partir de lg.
  const primaryNavItems = [
    { label: t('nav.offers'), href: '/ofertas' },
    ...(settings.vlogEnabled ? [{ label: t('nav.vlog'), href: '/vlog' }] : []),
    { label: t('nav.shipping'), href: '/frete' },
  ];
  const secondaryNavItems = [
    { label: t('nav.howItWorks'), href: '/como-funciona' },
    { label: t('nav.customRequest'), href: '/faca-seu-pedido' },
    { label: t('nav.business'), href: '/empresas' },
    { label: t('nav.about'), href: '/sobre' },
  ];
  const navItems = [...primaryNavItems, ...secondaryNavItems];

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  // No painel admin a loja é só em português → esconde o seletor de idioma
  const isAdminPage = location.pathname.startsWith('/admin');

  const trustItems = [
    { icon: Lock,            text: t('trust.ssl') },
    { icon: ShieldCheckIcon, text: t('trust.protectedPurchase') },
    { icon: Package,         text: t('trust.compliantShipping') },
    { icon: Plane,           text: t('trust.directShipping') },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const url = selectedCategory !== 'all' ? `/produtos/${selectedCategory}?q=${encodeURIComponent(searchQuery)}` : `/produtos?q=${encodeURIComponent(searchQuery)}`;
      window.location.href = url;
    }
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-purple-100/80 bg-white/90 shadow-[0_12px_35px_-28px_rgba(157,23,77,0.5)] backdrop-blur-xl">
      {/* Barra de confiança — esconde no painel admin.
          Mobile: marquee contínuo (não corta as pontas). Desktop: centralizado. */}
      {!isAdminPage && (
        <div className="overflow-hidden bg-gradient-to-r from-purple-600 via-primary to-violet-600 text-[11px] font-semibold text-primary-foreground shadow-sm">
          {/* Desktop (lg+): centralizado, cabe inteiro */}
          <div className="hidden lg:flex items-center justify-center gap-6 px-4 py-1.5 whitespace-nowrap">
            {trustItems.map(({ icon: Icon, text }) => (
              <span key={text} className="flex items-center gap-1.5">
                <Icon className="w-3 h-3 opacity-90" />
                {text}
              </span>
            ))}
          </div>
          {/* Mobile: marquee rolando da direita para a esquerda (sem corte) */}
          <div className="lg:hidden py-1.5 overflow-hidden">
            <div className="flex items-center gap-8 whitespace-nowrap animate-marquee">
              {[...trustItems, ...trustItems].map(({ icon: Icon, text }, i) => (
                <span key={i} className="flex items-center gap-1.5 shrink-0">
                  <Icon className="w-3 h-3 opacity-90" />
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4">
        {/* Top Bar: Logo + Search + User Menu */}
        <div className="flex h-20 items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="group flex shrink-0 items-center" aria-label="NikkeyBox — início">
            <div className="flex flex-col leading-none">
              <span className="font-brand text-xl font-black tracking-tight text-foreground sm:text-2xl lg:text-3xl">Nikkey</span>
              <span className="animate-nikkeybox-pulse font-display text-base font-extrabold tracking-tight text-primary sm:text-lg lg:text-xl">Box</span>
            </div>
          </Link>

          {/* Search Bar — Desktop (escondida no admin) */}
          {!isAdminPage && (
            <form onSubmit={handleSearch} className="mx-4 hidden max-w-2xl flex-1 items-center gap-2 overflow-hidden rounded-2xl border border-purple-100 bg-white/90 shadow-sm transition-all focus-within:border-purple-300 focus-within:shadow-lg focus-within:shadow-purple-100/60 md:flex">
              <input
                type="text"
                placeholder={t('nav.search') || 'Buscar...'}
                aria-label={t('nav.search') || 'Buscar produtos'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-slate-400"
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label={t('nav.products.all') || 'Categoria'}
                className="cursor-pointer border-l border-purple-100 bg-transparent px-3 py-2.5 text-sm outline-none"
              >
                <option value="all">{t('nav.products.all') || 'Todos'}</option>
                {categoriesWithProducts.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                ))}
              </select>
              <button type="submit" className="m-1 flex h-9 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-md transition-all hover:scale-105 hover:shadow-lg" aria-label={t('nav.search') || 'Buscar'}>
                <Search className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* Right Menu: Wishlist, Cart, User, Language */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* País (cima) + Idioma (baixo) — idioma sempre visível, país aparece a partir de md */}
            {!isAdminPage && (
              <div className="flex flex-col gap-1">
                <div className="hidden md:block">
                  <CountrySwitcher />
                </div>
                <LanguageSwitcher />
              </div>
            )}

            {/* Admin + Perfil empilhados (desktop) — igual País/Idioma */}
            <div className="hidden xl:flex flex-col gap-1">
              {isAdmin && (
                <Link
                  to={isAdminPage ? '/' : '/admin'}
                  className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/10 border border-purple-300/60 rounded-full text-[11px] font-semibold text-purple-700 dark:text-purple-400 hover:bg-purple-500/20 transition-colors"
                >
                  {isAdminPage
                    ? <><ShoppingCart className="w-3.5 h-3.5" /> Ver Loja</>
                    : <><UserCircle className="w-3.5 h-3.5 animate-pulse" /> Admin</>}
                </Link>
              )}
              <Link
                to={isAuthenticated ? '/perfil' : '/cadastro'}
                className="flex items-center gap-1.5 px-2 py-1 bg-secondary/80 border border-border rounded-full text-[11px] font-semibold text-foreground hover:bg-secondary transition-colors"
              >
                <UserCircle className="w-3.5 h-3.5" />
                {isAuthenticated ? (user?.name?.split(' ')[0] || t('nav.profile')) : t('nav.register')}
              </Link>
            </div>

            {/* Favoritos + Carrinho empilhados */}
            {!isAdminPage && (
              <div className="flex flex-col gap-1">
                {isAuthenticated && (
                  <Link
                    to="/favoritos"
                    className="relative p-1.5 rounded-full hover:bg-secondary/50 transition-colors"
                    title={t('nav.favorites')}
                  >
                    <Heart className="w-5 h-5 text-foreground" />
                  </Link>
                )}
                <Link
                  to="/carrinho"
                  className="relative rounded-xl border border-transparent p-2 transition-all hover:border-purple-100 hover:bg-purple-50"
                  aria-label={`${t('nav.cart') || 'Carrinho'}${totalItems > 0 ? ` — ${totalItems}` : ''}`}
                >
                  <ShoppingCart className="h-5 w-5 text-foreground" />
                  {totalItems > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                      {totalItems}
                    </span>
                  )}
                </Link>
              </div>
            )}

            <button
              className="md:hidden p-2 rounded-full hover:bg-secondary/50 transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              type="button"
              aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Navigation Menu — Desktop (hidden no admin) */}
        {!isAdminPage && (
          <nav className="hidden items-center gap-1 border-t border-purple-100/60 pb-2 pt-2 md:flex" aria-label="Navegação principal">
            <Link to="/produtos" className="rounded-full bg-purple-50 px-3 py-1.5 text-sm font-bold text-purple-600 transition-all hover:-translate-y-0.5 hover:bg-purple-100 whitespace-nowrap shrink-0">
              {t('nav.products')}
            </Link>
            {primaryNavItems.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  "text-sm font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors shrink-0",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/70"
                )}
              >
                {item.label}
              </Link>
            ))}
            {secondaryNavItems.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  "hidden lg:inline-block text-sm font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors shrink-0",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/70"
                )}
              >
                {item.label}
              </Link>
            ))}
            {/* Faixa intermediária (md–lg): agrupa itens secundários em "Mais" para não apertar a leitura */}
            <div className="relative shrink-0 lg:hidden" ref={moreRef}>
              <button
                type="button"
                onClick={() => setIsMoreOpen((prev) => !prev)}
                aria-haspopup="true"
                aria-expanded={isMoreOpen}
                aria-controls="header-more-menu"
                className={cn(
                  "flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors",
                  secondaryNavItems.some((item) => isActive(item.href))
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/70"
                )}
              >
                {t('nav.more') || 'Mais'}
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isMoreOpen && "rotate-180")} aria-hidden="true" />
              </button>
              {isMoreOpen && (
                <div
                  id="header-more-menu"
                  role="menu"
                  aria-label={t('nav.more') || 'Mais'}
                  className="absolute left-0 mt-2 w-48 rounded-xl bg-card border border-border shadow-lg z-50 py-1.5 animate-fade-in"
                >
                  {secondaryNavItems.map((item) => (
                    <Link
                      key={item.label}
                      to={item.href}
                      role="menuitem"
                      onClick={() => setIsMoreOpen(false)}
                      className={cn(
                        "block px-3.5 py-2 text-sm font-medium transition-colors",
                        isActive(item.href)
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>
        )}

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden py-4 border-t border-border animate-fade-up">
            {/* Mobile Search */}
            {!isAdminPage && (
              <form onSubmit={handleSearch} className="mb-4 flex gap-2 bg-secondary/50 rounded-lg border border-border overflow-hidden">
                <input
                  type="text"
                  placeholder={t('nav.search') || 'Buscar...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent px-4 py-2 text-sm outline-none"
                />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-transparent px-3 py-2 text-sm border-l border-border outline-none cursor-pointer"
                >
                  <option value="all">{t('nav.products.all') || 'Todos'}</option>
                  {categoriesWithProducts.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                </select>
                <button type="submit" className="px-4 py-2 text-primary-foreground bg-primary hover:bg-primary/90 transition-colors">
                  <Search className="w-5 h-5" />
                </button>
              </form>
            )}

            {/* Switchers (escondidos no admin) */}
            {!isAdminPage && (
              <div className="flex flex-col items-center gap-3 pb-4 mb-4 border-b border-border">
                <CountrySwitcher />
                <LanguageSwitcher />
              </div>
            )}

            {!isAdminPage && (
              <>
                <Link
                  to="/produtos"
                  className="block py-3 text-base font-medium transition-colors text-muted-foreground hover:text-foreground"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t('nav.products')}
                </Link>
                {navItems.map((item) => (
                  <Link
                    key={item.label}
                    to={item.href}
                    className={cn(
                      "block py-3 text-base font-medium transition-colors",
                      isActive(item.href) ? "text-primary" : "text-muted-foreground"
                    )}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </>
            )}

            <Button
              asChild
              variant="ghost"
              className="w-full justify-start mt-2 text-base font-medium"
            >
              <Link to={isAuthenticated ? "/perfil" : "/cadastro"} onClick={() => setIsMenuOpen(false)}>
                <UserCircle className="w-5 h-5 mr-2" />
                {isAuthenticated ? (user?.name?.split(' ')[0] || t('nav.profile')) : t('nav.register')}
              </Link>
            </Button>
            {/* Wishlist Mobile (escondido no admin) */}
            {isAuthenticated && !isAdminPage && (
              <Button
                asChild
                variant="ghost"
                className="w-full justify-start text-base font-medium"
              >
                <Link to="/favoritos" onClick={() => setIsMenuOpen(false)}>
                  <Heart className="w-5 h-5 mr-2" />
                  {t('nav.favorites')}
                </Link>
              </Button>
            )}
            {/* Admin/Loja Mobile */}
            {isAdmin && (
              <Button
                asChild
                variant="ghost"
                className="w-full justify-start text-base font-medium text-purple-600 hover:text-purple-700"
              >
                {isAdminPage ? (
                  <Link to="/" onClick={() => setIsMenuOpen(false)}>
                    <ShoppingCart className="w-5 h-5 mr-2 text-primary" />
                    Ver Loja
                  </Link>
                ) : (
                  <Link to="/admin" onClick={() => setIsMenuOpen(false)}>
                    <UserCircle className="w-5 h-5 mr-2 text-primary animate-pulse" />
                    {t('nav.admin')}
                  </Link>
                )}
              </Button>
            )}
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
