import React, { useState, useEffect } from 'react';
import { Users, Globe, MapPin, TrendingUp, ExternalLink, RefreshCw, FileText, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { visitorService } from '@/services/visitorService';

const FLAG: Record<string, string> = {
  BR: '🇧🇷', PT: '🇵🇹', US: '🇺🇸', JP: '🇯🇵', FR: '🇫🇷', IT: '🇮🇹',
  ES: '🇪🇸', DE: '🇩🇪', AR: '🇦🇷', MX: '🇲🇽', GB: '🇬🇧', CA: '🇨🇦',
  AU: '🇦🇺', CL: '🇨🇱', CO: '🇨🇴', PE: '🇵🇪', UY: '🇺🇾', PY: '🇵🇾',
  BO: '🇧🇴', VE: '🇻🇪', EC: '🇪🇨', AO: '🇦🇴', MZ: '🇲🇿', CV: '🇨🇻',
};

const COUNTRY_NAME: Record<string, string> = {
  BR: 'Brasil', PT: 'Portugal', US: 'EUA', JP: 'Japão', FR: 'França',
  IT: 'Itália', ES: 'Espanha', DE: 'Alemanha', AR: 'Argentina', MX: 'México',
  GB: 'Reino Unido', CA: 'Canadá', AU: 'Austrália', CL: 'Chile', CO: 'Colômbia',
  PE: 'Peru', UY: 'Uruguai', PY: 'Paraguai', BO: 'Bolívia', VE: 'Venezuela',
  EC: 'Equador', AO: 'Angola', MZ: 'Moçambique', CV: 'Cabo Verde',
};

const GA4_URL = 'https://analytics.google.com/analytics/web/';

type TabId = 'overview' | 'pages' | 'products';

export default function VisitorStats() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [tab, setTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof visitorService['getSummary']>> | null>(null);
  const [topPages, setTopPages] = useState<Array<{ slug: string; label: string; views: number }>>([]);
  const [topProducts, setTopProducts] = useState<Array<{ productId: string; productName: string; views: number }>>([]);

  async function load() {
    setLoading(true);
    const [s, pages, products] = await Promise.all([
      visitorService.getSummary(period),
      visitorService.getTopPages(15),
      visitorService.getTopProducts(15),
    ]);
    setSummary(s);
    setTopPages(pages);
    setTopProducts(products);
    setLoading(false);
  }

  useEffect(() => { load(); }, [period]);

  // Gráfico de barras simples (últimos 14 dias)
  const chartDays = summary?.dailyData.slice(-14) ?? [];
  const maxVal = Math.max(...chartDays.map(d => d.total), 1);

  // Hoje
  const today = summary?.dailyData[summary.dailyData.length - 1];
  const todayTotal = today?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-pink-500" />
          <h2 className="text-lg font-bold">Visitantes do Site</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {([7, 30, 90] as const).map(d => (
            <button key={d} onClick={() => setPeriod(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                period === d ? 'bg-pink-500 text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              }`}>{d} dias</button>
          ))}
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 w-fit">
        {([
          { id: 'overview', label: 'Visão Geral', icon: Users },
          { id: 'pages', label: 'Páginas', icon: FileText },
          { id: 'products', label: 'Produtos', icon: ShoppingBag },
        ] as { id: TabId; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === id ? 'bg-pink-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
        </div>
      ) : summary ? (
        <>
          {/* KPIs — sempre visíveis */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-2xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Hoje</p>
              <p className="text-3xl font-bold text-foreground">{todayTotal}</p>
              <p className="text-xs text-muted-foreground mt-1">visitantes únicos</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">{period} dias</p>
              <p className="text-3xl font-bold text-foreground">{summary.totalVisits.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">total de visitas</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Média/dia</p>
              <p className="text-3xl font-bold text-foreground">{summary.avgPerDay}</p>
              <p className="text-xs text-muted-foreground mt-1">visitantes por dia</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Países</p>
              <p className="text-3xl font-bold text-foreground">{summary.topCountries.length}</p>
              <p className="text-xs text-muted-foreground mt-1">origens diferentes</p>
            </div>
          </div>

          {/* Visão geral: gráfico + países + cidades */}
          {tab === 'overview' && chartDays.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-pink-500" />
                <h3 className="font-semibold text-sm">Visitas — últimos {Math.min(14, chartDays.length)} dias</h3>
              </div>
              <div className="flex items-end gap-1 h-32">
                {chartDays.map((d) => {
                  const pct = Math.max(4, Math.round((d.total / maxVal) * 100));
                  const label = d.date.slice(5); // 'MM-DD'
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                        {d.total}
                      </span>
                      <div
                        className="w-full rounded-t-sm bg-pink-500 hover:bg-pink-400 transition-colors cursor-default"
                        style={{ height: `${pct}%` }}
                        title={`${label}: ${d.total} visitas`}
                      />
                      <span className="text-[8px] text-muted-foreground rotate-45 origin-left translate-y-1">
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'overview' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Países */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-pink-500" />
                <h3 className="font-semibold text-sm">Países (top {summary.topCountries.length})</h3>
              </div>
              {summary.topCountries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados ainda</p>
              ) : (
                <div className="space-y-2">
                  {summary.topCountries.map(({ code, count }) => {
                    const pct = Math.round((count / summary.totalVisits) * 100);
                    return (
                      <div key={code}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span>{FLAG[code] ?? '🌍'}</span>
                            {COUNTRY_NAME[code] ?? code}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs">
                            {count} <span className="text-pink-500 font-semibold">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-pink-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Dica Instagram */}
              {summary.topCountries.length > 0 && (
                <div className="mt-4 p-3 bg-pink-50 dark:bg-pink-950/20 rounded-xl border border-pink-100 dark:border-pink-900">
                  <p className="text-xs font-semibold text-pink-700 dark:text-pink-300 mb-1">📸 Dica para o Instagram</p>
                  <p className="text-xs text-pink-600 dark:text-pink-400 leading-relaxed">
                    {summary.topCountries[0]
                      ? `${pct_fmt(summary.topCountries[0], summary.totalVisits)} dos seus visitantes são do ${COUNTRY_NAME[summary.topCountries[0].code] ?? summary.topCountries[0].code}. Publique entre 19h–21h (horário local) para alcançar mais esse público.`
                      : 'Acumule mais dados para receber dicas personalizadas.'}
                  </p>
                </div>
              )}
            </div>

            {/* Top Cidades */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-pink-500" />
                <h3 className="font-semibold text-sm">Cidades (top {summary.topCities.length})</h3>
              </div>
              {summary.topCities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados ainda</p>
              ) : (
                <div className="space-y-2">
                  {summary.topCities.map(({ city, count }) => {
                    const pct = Math.round((count / summary.totalVisits) * 100);
                    return (
                      <div key={city} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{city}</span>
                        <span className="font-mono text-xs text-pink-600 font-semibold">{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>}

          {/* Tab: Páginas */}
          {tab === 'pages' && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-pink-500" />
                <h3 className="font-semibold text-sm">Páginas mais visitadas</h3>
              </div>
              {topPages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda sem dados de páginas. Os dados aparecem conforme os visitantes navegam.</p>
              ) : (
                <div className="space-y-2">
                  {topPages.map((p, i) => {
                    const maxViews = topPages[0]?.views || 1;
                    const pct = Math.round((p.views / maxViews) * 100);
                    return (
                      <div key={p.slug}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground w-4 shrink-0">#{i + 1}</span>
                            <span className="truncate font-medium">{p.label}</span>
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0 hidden sm:inline">{p.slug}</span>
                          </span>
                          <span className="font-mono text-xs text-pink-600 font-semibold shrink-0 ml-2">{p.views.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-pink-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab: Produtos */}
          {tab === 'products' && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingBag className="w-4 h-4 text-pink-500" />
                <h3 className="font-semibold text-sm">Produtos mais visualizados</h3>
              </div>
              {topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda sem dados de produtos. Os dados aparecem quando visitantes abrem a página de um produto.</p>
              ) : (
                <div className="space-y-2">
                  {topProducts.map((p, i) => {
                    const maxViews = topProducts[0]?.views || 1;
                    const pct = Math.round((p.views / maxViews) * 100);
                    return (
                      <div key={p.productId}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground w-4 shrink-0">#{i + 1}</span>
                            <a
                              href={`/produto/${p.productId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate font-medium hover:text-pink-500 hover:underline transition-colors"
                            >
                              {p.productName}
                            </a>
                          </span>
                          <span className="font-mono text-xs text-pink-600 font-semibold shrink-0 ml-2">
                            {p.views.toLocaleString()} views
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-pink-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {topProducts.length > 0 && (
                <div className="mt-4 p-3 bg-pink-50 dark:bg-pink-950/20 rounded-xl border border-pink-100 dark:border-pink-900">
                  <p className="text-xs font-semibold text-pink-700 dark:text-pink-300 mb-1">📸 Dica para o Instagram</p>
                  <p className="text-xs text-pink-600 dark:text-pink-400 leading-relaxed">
                    <strong>{topProducts[0]?.productName}</strong> é o produto mais procurado. Publique stories e reels sobre ele para converter mais visitantes!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Link GA4 */}
          <div className="bg-secondary/40 rounded-2xl border border-border p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-semibold text-sm mb-1">Google Analytics 4 — dados completos</p>
              <p className="text-xs text-muted-foreground">
                Bounce rate, tempo de sessão, canais de aquisição, funil de conversão e muito mais.
              </p>
            </div>
            <a href={GA4_URL} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold hover:bg-pink-600 transition-colors shrink-0">
              <ExternalLink className="w-4 h-4" />
              Abrir GA4
            </a>
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-muted-foreground">Sem dados disponíveis</div>
      )}
    </div>
  );
}

function pct_fmt(item: { count: number }, total: number) {
  return `${Math.round((item.count / total) * 100)}%`;
}
