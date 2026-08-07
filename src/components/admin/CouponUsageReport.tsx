import React, { useCallback, useEffect, useState } from 'react';
import { Tag, TrendingDown, ShoppingBag, Percent } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { authenticatedFetch } from '@/services/authenticatedFetch';

const couponRowSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  orderDate: z.string(),
  customerEmail: z.string(),
  couponCode: z.string(),
  couponDiscount: z.number(),
  currency: z.string(),
  discountYen: z.number(),
  grandTotalYen: z.number(),
  isAffiliate: z.boolean(),
  affiliateCode: z.string(),
});

const couponPageSchema = z.object({
  items: z.array(couponRowSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
});

type CouponRow = z.infer<typeof couponRowSchema>;

const CouponUsageReport: React.FC = () => {
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'coupon' | 'affiliate'>('all');

  const fetchPage = useCallback(async (pageCursor: string | null, reset: boolean) => {
    reset ? setLoading(true) : setLoadingMore(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '25', type: filterType });
      if (filterCode.trim()) params.set('code', filterCode.trim());
      if (pageCursor) params.set('cursor', pageCursor);
      const response = await authenticatedFetch(`/api/admin-coupon-usage?${params.toString()}`);
      if (!response.ok) throw new Error('coupon_usage_request_failed');
      const page = couponPageSchema.parse(await response.json());
      setRows((current) => {
        if (reset) return page.items;
        const known = new Set(current.map((row) => row.id));
        return [...current, ...page.items.filter((row) => !known.has(row.id))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      if (reset) {
        setRows([]);
        setCursor(null);
        setHasMore(false);
      }
      setError('Não foi possível carregar o relatório.');
    } finally {
      reset ? setLoading(false) : setLoadingMore(false);
    }
  }, [filterCode, filterType]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPage(null, true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fetchPage]);

  const filtered = rows;
  const totalDiscountYen = filtered.reduce((sum, row) => sum + row.discountYen, 0);
  const totalOrders = filtered.length;

  const byCode: Record<string, { count: number; totalYen: number; isAffiliate: boolean }> = {};
  filtered.forEach((row) => {
    const key = row.affiliateCode || row.couponCode || '(sem código)';
    if (!byCode[key]) byCode[key] = { count: 0, totalYen: 0, isAffiliate: row.isAffiliate };
    byCode[key].count += 1;
    byCode[key].totalYen += row.discountYen;
  });
  const topCodes = Object.entries(byCode).sort((left, right) => right[1].totalYen - left[1].totalYen);

  const fmt = (value: number, currency: string) =>
    currency === 'JPY'
      ? `¥${value.toLocaleString()}`
      : `R$${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800 p-4">
          <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mb-1 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5" /> Total Descontado
          </p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">≈¥{totalDiscountYen.toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Receita que deixou de entrar</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <ShoppingBag className="w-3.5 h-3.5" /> Pedidos c/ desconto
          </p>
          <p className="text-2xl font-bold">{totalOrders}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Percent className="w-3.5 h-3.5" /> Desconto Médio
          </p>
          <p className="text-2xl font-bold">≈¥{totalOrders > 0 ? Math.round(totalDiscountYen / totalOrders).toLocaleString() : 0}</p>
        </div>
      </div>

      {/* Top códigos */}
      {topCodes.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Tag className="w-4 h-4" /> Por Código</h3>
          <div className="space-y-2">
            {topCodes.map(([code, data]) => (
              <div key={code} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${data.isAffiliate ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'}`}>
                    {data.isAffiliate ? 'Afiliado' : 'Cupom'}
                  </span>
                  <span className="font-mono font-semibold">{code}</span>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-amber-600">≈¥{data.totalYen.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">{data.count} uso{data.count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {(['all', 'coupon', 'affiliate'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 text-xs rounded-full font-semibold transition-colors ${filterType === t ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
              {t === 'all' ? 'Todos' : t === 'coupon' ? 'Cupons' : 'Afiliados'}
            </button>
          ))}
        </div>
        <input
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
          placeholder="Filtrar por código..."
          value={filterCode}
          onChange={e => setFilterCode(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Totais calculados sobre {filtered.length} resultado{filtered.length === 1 ? '' : 's'} carregado{filtered.length === 1 ? '' : 's'}.
      </p>

      {/* Tabela */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhum desconto encontrado.</p>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Pedido</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Código</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Tipo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Desconto</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">≈¥</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.orderNumber.slice(-8)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.orderDate ? new Date(r.orderDate).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs truncate max-w-[140px]">{r.customerEmail || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-xs">
                        {r.affiliateCode || r.couponCode || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.isAffiliate ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'}`}>
                        {r.isAffiliate ? 'Afiliado' : 'Cupom'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-red-500 font-semibold text-xs">
                      {r.couponDiscount > 0 ? `−${fmt(r.couponDiscount, r.currency)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-600 text-xs">
                      {r.discountYen > 0 ? `≈¥${r.discountYen.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t-2 border-border">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-muted-foreground">Total ({filtered.length} pedidos)</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-red-500">—</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-amber-600">≈¥{totalDiscountYen.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      {hasMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void fetchPage(cursor, false)}
            disabled={loadingMore || !cursor}
          >
            {loadingMore ? 'Carregando...' : 'Carregar mais resultados'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CouponUsageReport;
