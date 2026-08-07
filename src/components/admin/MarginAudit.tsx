import React, { useMemo, useState } from 'react';
import { useProducts } from '@/context/ProductsContext';
import { minEffectiveYen } from '@/utils/pricing';
import { TrendingDown, AlertTriangle, CheckCircle, Search, Pencil } from 'lucide-react';
import type { Product } from '@/types';

// Margem alvo: lucro deve ser >= 50% do PREÇO DE VENDA (markup 100% = custo×2).
const TARGET_MARGIN = 0.5;

interface Row {
  product: Product;
  costYen: number;
  priceYen: number;
  profitYen: number;
  marginPct: number;     // lucro / preço de venda
  belowTarget: boolean;
  hasCost: boolean;
}

const MarginAudit: React.FC = () => {
  const { products } = useProducts();
  const [search, setSearch] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(true);

  const rows = useMemo<Row[]>(() => {
    return products.map(p => {
      const costYen = Number(p.cost) || 0;
      const priceYen = minEffectiveYen(p);
      const profitYen = priceYen - costYen;
      const marginPct = priceYen > 0 ? profitYen / priceYen : 0;
      return {
        product: p,
        costYen,
        priceYen,
        profitYen,
        marginPct,
        hasCost: costYen > 0,
        // Só marca como problema quando há custo cadastrado e a margem fica abaixo de 50%
        belowTarget: costYen > 0 && priceYen > 0 && marginPct < TARGET_MARGIN,
      };
    }).sort((a, b) => a.marginPct - b.marginPct); // pior margem primeiro
  }, [products]);

  const filtered = rows.filter(r => {
    const matchSearch = !search || r.product.name.toLowerCase().includes(search.toLowerCase());
    const matchProblem = !onlyProblems || r.belowTarget;
    return matchSearch && matchProblem;
  });

  const problemCount = rows.filter(r => r.belowTarget).length;
  const noCostCount = rows.filter(r => !r.hasCost).length;
  const okCount = rows.filter(r => r.hasCost && !r.belowTarget).length;

  const yen = (v: number) => `¥${Math.round(v).toLocaleString('ja-JP')}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <TrendingDown className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">Auditoria de Margem</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Verifica se algum produto tem lucro abaixo de <strong>50% do preço de venda</strong>
        (ideal: preço = custo × 2). Produtos sem custo cadastrado não entram no cálculo.
      </p>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{problemCount}</p>
          <p className="text-xs text-muted-foreground">Abaixo de 50%</p>
        </div>
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{okCount}</p>
          <p className="text-xs text-muted-foreground">Margem OK</p>
        </div>
        <div className="bg-secondary/40 border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{noCostCount}</p>
          <p className="text-xs text-muted-foreground">Sem custo cadastrado</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar produto…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <button
          onClick={() => setOnlyProblems(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
            onlyProblems ? 'bg-red-500 text-white border-red-500' : 'border-border text-muted-foreground hover:bg-secondary'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Só abaixo de 50%
        </button>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
          <CheckCircle className="w-10 h-10 text-green-500" />
          {onlyProblems ? 'Nenhum produto com margem abaixo de 50%! 🎉' : 'Nenhum produto encontrado.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div
              key={r.product.id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                r.belowTarget ? 'border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10'
                : !r.hasCost ? 'border-border bg-secondary/20'
                : 'border-border'
              }`}
            >
              {(r.product.thumbnail || r.product.image) && (
                <img src={r.product.thumbnail || r.product.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{r.product.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                  <span>Custo: {r.hasCost ? yen(r.costYen) : '—'}</span>
                  <span>Venda: {yen(r.priceYen)}</span>
                  {r.hasCost && <span>Lucro: {yen(r.profitYen)}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                {r.hasCost ? (
                  <span className={`text-sm font-bold ${r.belowTarget ? 'text-red-600' : 'text-green-600'}`}>
                    {(r.marginPct * 100).toFixed(0)}%
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 font-medium">sem custo</span>
                )}
                {r.belowTarget && (
                  <p className="text-[10px] text-red-500">
                    sugerido: {yen(r.costYen * 2)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MarginAudit;
