import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Search, X, SlidersHorizontal, ChevronDown, Eye, EyeOff, Menu } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import CompactProductCard from '@/components/products/CompactProductCard';
import SidebarFilters from '@/components/products/SidebarFilters';
import { useProducts } from '@/context/ProductsContext';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';
import { usePagination } from '@/hooks/usePagination';
import Pagination from '@/components/Pagination';
import { minEffectiveYen } from '@/utils/pricing';
import { categoryService, DEFAULT_CATEGORIES, type ProductCategory } from '@/services/categoryService';
import ItemListJsonLd from '@/components/ItemListJsonLd';

const normalize = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type SortKey = 'az' | 'za' | 'vendidos' | 'lancamento' | 'preco-menor' | 'preco-maior';

const SORT_KEYS: SortKey[] = ['az', 'za', 'vendidos', 'lancamento'];

const CATEGORY_ICONS: Record<string, string> = {
  cosmeticos: '🧴', acessorios: '🎮', doces: '🍵', papelaria: '✏️',
  eletronicos: '📱', masculino: '👔', vestuario: '👕', higiene: '🧼',
};

const Products: React.FC = () => {
  const { category } = useParams<{ category?: string }>();
  const [searchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);

  const SORT_OPTIONS = [
    { key: 'preco-menor' as SortKey, label: t('productsPage.sortPriceAsc') || 'Menor preço' },
    { key: 'preco-maior' as SortKey, label: t('productsPage.sortPriceDesc') || 'Maior preço' },
    { key: 'az' as SortKey,         label: t('productsPage.sortAZ') },
    { key: 'za' as SortKey,         label: t('productsPage.sortZA') },
    { key: 'vendidos' as SortKey,   label: t('productsPage.sortBestseller') },
    { key: 'lancamento' as SortKey, label: t('productsPage.sortNew') },
  ];

  // Categorias dinâmicas (padrão + personalizadas do Firestore) — igual ao Header
  const [allCategories, setAllCategories] = useState<ProductCategory[]>(DEFAULT_CATEGORIES);
  useEffect(() => { categoryService.getAll().then(setAllCategories).catch(() => {}); }, []);

  const getCatIcon = (id: string) => allCategories.find(c => c.id === id)?.icon || CATEGORY_ICONS[id] || '🛍️';
  const getCategoryLabel = (id: string) =>
    allCategories.find(c => c.id === id)?.label || t(`product.category.${id}`) || id;
  const getCategoryDesc = (id: string) => {
    const descs: Record<string, Record<string, string>> = {
      pt: {
        cosmeticos: 'Os cosméticos, protetores solares e produtos de skin care mais famosos do Japão.',
        acessorios: 'Action figures originais de anime, luminárias kawaii e organizadores minimalistas.',
        doces: 'Doces finos de matcha, chás verdes tradicionais orgânicos e guloseimas de Tóquio.',
        papelaria: 'Canetas gel Sakura de fluxo suave e papelaria japonesa de alta durabilidade.',
        eletronicos: 'Gadgets, acessórios e eletrônicos japoneses com tecnologia de ponta.',
        masculino: 'Produtos pensados para o público masculino com estilo e qualidade japonesa.',
        vestuario: 'Roupas e peças com design e conforto japonês.',
        higiene: 'Produtos de higiene pessoal e saúde com a qualidade japonesa.',
      },
      en: {
        cosmeticos: 'The most famous Japanese cosmetics, sunscreens and skincare products.',
        acessorios: 'Original anime figures, kawaii lamps and minimalist organizers.',
        doces: 'Premium matcha sweets, organic green teas and Tokyo exclusive treats.',
        papelaria: 'Smooth-flow Sakura gel pens and durable Japanese stationery.',
        eletronicos: 'Japanese gadgets, accessories and electronics with cutting-edge tech.',
        masculino: 'Products designed for men with Japanese style and quality.',
        vestuario: 'Clothing with Japanese design and comfort.',
        higiene: 'Personal care and health products with Japanese quality.',
      },
      ja: {
        cosmeticos: '日本の人気コスメ・日焼け止め・スキンケア製品。',
        acessorios: 'アニメオリジナルフィギュア、かわいいランプ、ミニマルオーガナイザー。',
        doces: '抹茶スイーツ・有機緑茶・東京限定おやつ。',
        papelaria: 'サクラのゲルペンと高品質の日本文房具。',
        eletronicos: '最先端技術の日本製ガジェット・アクセサリー・電子機器。',
        masculino: '日本品質のメンズケア商品。',
        vestuario: '日本デザインの快適なウェア。',
        higiene: '日本品質の衛生・健康ケア商品。',
      },
    };
    return descs[language]?.[id] || descs['pt'][id] || '';
  };
  const { products, loading } = useProducts();

  const [query,      setQuery]      = useState(searchParams.get('q') || '');
  const [sort,       setSort]       = useState<SortKey | null>(null);
  const [catFilter,  setCatFilter]  = useState<string | null>(null); // só em /todos
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Reset type filter when category changes (route or catFilter)
  useEffect(() => { setTypeFilter(null); }, [category, catFilter]);
  // Reset catFilter when navigating to a specific category
  useEffect(() => { if (category && category !== 'all') setCatFilter(null); }, [category]);

  const isAllRoute = !category || category === 'all';

  // Produtos visíveis (nunca mostra ocultos)
  const visible = useMemo(() => products.filter(p => !p.hidden), [products]);

  // Categoria efetiva: rota sobrepõe filtro do painel
  const effectiveCat = isAllRoute ? catFilter : category;

  // 1) Filtra por categoria
  const byCat = useMemo(() =>
    effectiveCat ? visible.filter(p => p.category === effectiveCat) : visible,
    [visible, effectiveCat]);

  // 2) Filtra por tipo/tag
  const byType = useMemo(() =>
    typeFilter ? byCat.filter(p => p.tags?.includes(typeFilter)) : byCat,
    [byCat, typeFilter]);

  // 3) Filtra por busca (nome, descrição, sabor e tags)
  const bySearch = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return byType;
    return byType.filter(p =>
      normalize(p.name).includes(q) ||
      normalize(p.description).includes(q) ||
      normalize(p.flavor).includes(q) ||
      p.tags?.some(tag => normalize(tag).includes(q))
    );
  }, [byType, query]);

  // 4) Ordena
  const displayProducts = useMemo(() => {
    if (!sort) return bySearch;
    const arr = [...bySearch];
    if (sort === 'az') arr.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    if (sort === 'za') arr.sort((a, b) => b.name.localeCompare(a.name, 'pt'));
    if (sort === 'vendidos') arr.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
    if (sort === 'lancamento') arr.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    if (sort === 'preco-menor') arr.sort((a, b) => minEffectiveYen(a) - minEffectiveYen(b));
    if (sort === 'preco-maior') arr.sort((a, b) => minEffectiveYen(b) - minEffectiveYen(a));
    return arr;
  }, [bySearch, sort]);

  const { page, totalPages, pageItems, setPage, rangeStart, rangeEnd, total } =
    usePagination(displayProducts, 12);

  const availableCats = useMemo(() =>
    Array.from(new Set(visible.map(p => p.category)))
      .sort((a, b) => getCategoryLabel(a).localeCompare(getCategoryLabel(b))),
    [visible, language, allCategories]);

  // Tipos disponíveis (tags) — mostra sempre que existam tags na lista atual
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    byCat.forEach(p => p.tags?.forEach(t => t && set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'));
  }, [byCat]);

  // Categorias como nav links (compatibilidade com rotas existentes)
  const navCategories = [
    { id: 'all', label: t('productsPage.all'), href: '/produtos' },
    ...availableCats.map(id => ({
      id,
      label: getCategoryLabel(id),
      href: `/produtos/${id}`,
    })),
  ];
  const currentRoute = category || 'all';

  const hasActiveFilters = !!(sort || catFilter || typeFilter);
  const clearFilters = () => { setSort(null); setCatFilter(null); setTypeFilter(null); };

  // Scroll para topo ao mudar de página
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  // Fecha o dropdown de filtros ao clicar fora
  const filterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [filtersOpen]);

  const catMeta = effectiveCat ? { icon: getCatIcon(effectiveCat), label: getCategoryLabel(effectiveCat), desc: getCategoryDesc(effectiveCat) } : null;

  return (
    <Layout>
      <div className="gradient-hero py-10">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="font-display text-3xl lg:text-4xl font-bold text-foreground mb-2">
              {t('productsPage.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('productsPage.description')}
            </p>
          </div>
        </div>
      </div>

      <section className="py-8 bg-background">
        <div className="container mx-auto px-4">
          {/* Banner da categoria atual (compacto) */}
          {catMeta && (
            <div className="mb-6 p-3.5 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-primary/10 shrink-0">
                  {catMeta.icon}
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-bold text-foreground leading-tight">{catMeta.label}</h2>
                  <p className="text-xs text-muted-foreground line-clamp-1">{catMeta.desc}</p>
                </div>
              </div>
            </div>
          )}

          {/* Resumo do filtro ativo */}
          {hasActiveFilters && (
            <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{t('productsPage.activeFilters')}</span>
              {sort && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {SORT_OPTIONS.find(o => o.key === sort)?.label}
                  <button onClick={() => setSort(null)}><X className="w-3 h-3" /></button>
                </span>
              )}
              {catFilter && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {CATEGORY_ICONS[catFilter]} {getCategoryLabel(catFilter)}
                  <button onClick={() => setCatFilter(null)}><X className="w-3 h-3" /></button>
                </span>
              )}
              {typeFilter && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-foreground text-xs font-semibold capitalize">
                  {typeFilter}
                  <button onClick={() => setTypeFilter(null)}><X className="w-3 h-3" /></button>
                </span>
              )}
              <span className="text-xs">— {total} {total !== 1 ? t('productsPage.products_plural') : t('productsPage.products')}</span>
            </div>
          )}

          {/* Layout: Filtro Lateral + Grid de Produtos */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Filtro Lateral — Desktop (20% width) */}
            <div className="hidden lg:block">
              <SidebarFilters
                categories={availableCats.map(id => allCategories.find(c => c.id === id)!).filter(Boolean)}
                types={availableTypes}
                selectedCategory={catFilter}
                selectedType={typeFilter}
                onCategoryChange={(id) => { setCatFilter(id); setPage(1); }}
                onTypeChange={(type) => { setTypeFilter(type); setPage(1); }}
              />
            </div>

            {/* Botão Mobile para abrir filtros */}
            <div className="lg:hidden mb-4">
              <button
                onClick={() => setShowFiltersPanel(!showFiltersPanel)}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors font-semibold"
              >
                <Menu className="w-5 h-5" />
                {t('productsPage.filters') || 'Filtros'}
              </button>

              {/* Filtro em Modal/Panel Mobile */}
              {showFiltersPanel && (
                <div className="mt-4 p-4 rounded-lg border border-border bg-card">
                  <SidebarFilters
                    categories={availableCats.map(id => allCategories.find(c => c.id === id)!).filter(Boolean)}
                    types={availableTypes}
                    selectedCategory={catFilter}
                    selectedType={typeFilter}
                    onCategoryChange={(id) => { setCatFilter(id); setPage(1); setShowFiltersPanel(false); }}
                    onTypeChange={(type) => { setTypeFilter(type); setPage(1); setShowFiltersPanel(false); }}
                  />
                </div>
              )}
            </div>

            {/* Grid de Produtos (80% width) */}
            <div className="lg:col-span-4">
              {/* Barra de busca. Perdida no redesign do catálogo (cbfdc66): o
                  estado `query`, o filtro `bySearch` e o botão "Limpar busca"
                  continuaram no código, só o input sumiu. Fica em largura total
                  no topo da coluna para aparecer também no mobile/PWA, onde os
                  filtros ficam atrás de um botão. */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  inputMode="search"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  placeholder={t('productsPage.search')}
                  aria-label={t('productsPage.search')}
                  className="w-full pl-9 pr-9 py-2.5 text-sm rounded-full border border-border bg-card text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:outline-none transition"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setPage(1); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-secondary text-muted-foreground"
                    aria-label="Limpar busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Toolbar: Sort */}
              <div className="mb-6 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {loading ? (
                    <span className="inline-block h-4 w-24 rounded bg-secondary animate-pulse align-middle" />
                  ) : (
                    <>{total} {total !== 1 ? t('productsPage.products_plural') : t('productsPage.products')}</>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <label htmlFor="sort" className="text-sm font-semibold text-muted-foreground">
                    {t('productsPage.sort')}:
                  </label>
                  <select
                    id="sort"
                    value={sort || ''}
                    onChange={(e) => { setSort((e.target.value as SortKey) || null); setPage(1); }}
                    className="px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="">{t('productsPage.relevance') || 'Relevância'}</option>
                    {SORT_OPTIONS.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                  {Array.from({ length: 12 }).map((_, idx) => (
                    <div key={idx} className="rounded-lg border border-border bg-card overflow-hidden animate-pulse">
                      <div className="aspect-square bg-secondary" />
                      <div className="p-2 space-y-2">
                        <div className="h-3 bg-secondary rounded w-4/5" />
                        <div className="h-4 bg-secondary rounded w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <ItemListJsonLd products={pageItems} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                    {pageItems.map((product) => (
                      <CompactProductCard key={product.id} product={product} />
                    ))}
                  </div>

                  {displayProducts.length > 0 && (
                    <Pagination
                      page={page}
                      totalPages={totalPages}
                      onPageChange={setPage}
                      rangeStart={rangeStart}
                      rangeEnd={rangeEnd}
                      total={total}
                      className="mt-12"
                    />
                  )}

                  {displayProducts.length === 0 && (
                    <div className="text-center py-16 col-span-full">
                      {query || hasActiveFilters ? (
                        <div>
                          <p className="text-muted-foreground mb-3">
                            {query
                              ? <>Nenhum produto encontrado para "<strong className="text-foreground">{query}</strong>".</>
                              : 'Nenhum produto com esses filtros.'}
                          </p>
                          <button
                            onClick={() => { setQuery(''); clearFilters(); }}
                            className="text-primary font-semibold hover:underline"
                          >
                            Limpar busca e filtros
                          </button>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">{t('productsPage.noProducts')}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Products;
