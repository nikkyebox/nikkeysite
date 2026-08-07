import React, { useEffect, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, Package, DollarSign, ShoppingBag, CheckCircle, XCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { z } from 'zod';
import { affiliateService } from '@/services/affiliateService';
import type { Affiliate, PendingCommission } from '@/services/affiliateService';
import { authenticatedFetch } from '@/services/authenticatedFetch';
import { getMarketingExpenses } from '@/components/admin/MarketingManager';
import type { MarketingExpense } from '@/components/admin/MarketingManager';
import { getEmployeePayments } from '@/components/admin/EmployeeManager';
import type { EmployeePayment } from '@/components/admin/EmployeeManager';
import type { OrderStatistics } from '@/types';
import MaintenanceToggle from '@/components/admin/MaintenanceToggle';
import ResetOrdersButton from '@/components/admin/ResetOrdersButton';
import WisePaymentSettings from '@/components/admin/WisePaymentSettings';
interface MonthlyFin {
  month: string;
  orders: number;
  receitaComFrete: number;
  receitaSemFrete: number;
  custo: number;
  lucro: number;
}

interface FinanceSummary {
  receitaComFrete: number;
  receitaSemFrete: number;
  receitaProduto: number;
  receitaPS: number;
  custo: number;
  lucro: number;
  comissoesYen: number;       // pendentes (a pagar)
  comissoesConfirmYen: number; // já liberadas/pagas
  marketingBRL: number;
  marketingJPY: number;
  salariosBRL: number;
  salariosJPY: number;
  descontosCupomYen: number;  // informativo apenas (não afeta lucro)
  lucroLiquido: number;
}

interface DashboardPayload {
  stats: OrderStatistics;
  finance: Pick<
    FinanceSummary,
    'receitaComFrete' | 'receitaSemFrete' | 'receitaProduto' | 'receitaPS'
    | 'custo' | 'lucro' | 'descontosCupomYen'
  >;
  monthlyData: MonthlyFin[];
  topProducts: { name: string; count: number }[];
  paymentMethods: { method: string; revenue: number }[];
}

const statsSchema = z.object({
  totalOrders: z.number(),
  pendingOrders: z.number(),
  shippedOrders: z.number(),
  deliveredOrders: z.number(),
  cancelledOrders: z.number(),
  totalRevenue: z.number(),
  revenueThisMonth: z.number(),
  revenueLastMonth: z.number(),
  ordersThisMonth: z.number(),
  ordersLastMonth: z.number(),
});

const dashboardSchema = z.object({
  ok: z.literal(true),
  stats: statsSchema,
  finance: z.object({
    receitaComFrete: z.number(),
    receitaSemFrete: z.number(),
    receitaProduto: z.number(),
    receitaPS: z.number(),
    custo: z.number(),
    lucro: z.number(),
    descontosCupomYen: z.number(),
  }),
  monthlyData: z.array(z.object({
    month: z.string(),
    orders: z.number(),
    receitaComFrete: z.number(),
    receitaSemFrete: z.number(),
    custo: z.number(),
    lucro: z.number(),
  })),
  topProducts: z.array(z.object({ name: z.string(), count: z.number() })),
  paymentMethods: z.array(z.object({ method: z.string(), revenue: z.number() })),
});

function SectionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between bg-muted/40 hover:bg-muted/70 transition-colors rounded-xl px-4 py-3 border border-border"
    >
      <span className="font-semibold text-base">{title}</span>
      {open ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
    </button>
  );
}

const Dashboard: React.FC = () => {
  const EMPTY_STATS: OrderStatistics = {
    totalOrders: 0, pendingOrders: 0, shippedOrders: 0, deliveredOrders: 0,
    cancelledOrders: 0, totalRevenue: 0, revenueThisMonth: 0, revenueLastMonth: 0,
    ordersThisMonth: 0, ordersLastMonth: 0,
  };
  const EMPTY_FINANCE: FinanceSummary = {
    receitaComFrete: 0, receitaSemFrete: 0, receitaProduto: 0, receitaPS: 0,
    custo: 0, lucro: 0, comissoesYen: 0, comissoesConfirmYen: 0,
    marketingBRL: 0, marketingJPY: 0, salariosBRL: 0, salariosJPY: 0,
    descontosCupomYen: 0, lucroLiquido: 0,
  };
  const [stats, setStats] = useState<OrderStatistics | null>(null);
  const [finance, setFinance] = useState<FinanceSummary>(EMPTY_FINANCE);
  const [monthlyData, setMonthlyData] = useState<MonthlyFin[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; count: number }[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<{ method: string; revenue: number }[]>([]);
  const [loadError, setLoadError] = useState('');

  const [openPedidos, setOpenPedidos] = useState(true);
  const [openFinanceiro, setOpenFinanceiro] = useState(true);
  const [openGraficos, setOpenGraficos] = useState(false);
  const [openConfig, setOpenConfig] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    void loadData();
  }, [refreshKey]);

  const loadData = async () => {
    setRefreshing(true);
    setLoadError('');
    const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
      Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

    try {
      const response = await withTimeout<Response | null>(
        authenticatedFetch('/api/admin-dashboard'),
        12_000,
        null,
      );
      if (!response?.ok) throw new Error('dashboard_request_failed');
      // Runtime schema validation establishes the network payload before the domain cast.
      const dashboard = dashboardSchema.parse(await response.json()) as DashboardPayload;

      const pendingPromise: Promise<PendingCommission[]> =
        withTimeout(affiliateService.getPendingCommissions(), 5_000, []).catch(() => []);
      const affiliatesPromise: Promise<Affiliate[]> =
        withTimeout(affiliateService.getAll(), 5_000, []).catch(() => []);
      const marketingPromise: Promise<MarketingExpense[]> =
        withTimeout(getMarketingExpenses(), 5_000, []).catch(() => []);
      const salariesPromise: Promise<EmployeePayment[]> =
        withTimeout(getEmployeePayments(), 5_000, []).catch(() => []);
      const [pending, allAffiliates, marketing, salaries] = await Promise.all([
        pendingPromise,
        affiliatesPromise,
        marketingPromise,
        salariesPromise,
      ]);

      const comissoesYen = pending.reduce((sum, item) => sum + (item.commissionYen || 0), 0);
      const comissoesConfirmYen = allAffiliates.reduce((sum, affiliate) => sum + (affiliate.totalEarnings || 0), 0);
      const marketingBRL = marketing.filter((item) => item.currency === 'BRL').reduce((sum, item) => sum + item.amount, 0);
      const marketingJPY = marketing.filter((item) => item.currency === 'JPY').reduce((sum, item) => sum + item.amount, 0);
      const salariosBRL = salaries.filter((item) => item.currency === 'BRL').reduce((sum, item) => sum + item.amount, 0);
      const salariosJPY = salaries.filter((item) => item.currency === 'JPY').reduce((sum, item) => sum + item.amount, 0);
      const totalComissoesYen = comissoesYen + comissoesConfirmYen;
      const marketingYen = marketingJPY + Math.round(marketingBRL * 28);
      const salariosYen = salariosJPY + Math.round(salariosBRL * 28);
      const lucroLiquido = dashboard.finance.receitaProduto
        + dashboard.finance.receitaPS
        - dashboard.finance.custo
        - totalComissoesYen
        - marketingYen
        - salariosYen;

      setStats(dashboard.stats);
      setFinance({
        ...dashboard.finance,
        comissoesYen,
        comissoesConfirmYen,
        marketingBRL,
        marketingJPY,
        salariosBRL,
        salariosJPY,
        lucroLiquido,
      });
      setMonthlyData(dashboard.monthlyData);
      setTopProducts(dashboard.topProducts);
      setPaymentMethods(dashboard.paymentMethods);
    } catch {
      setStats((current) => current || EMPTY_STATS);
      setLoadError('Não foi possível atualizar os dados consolidados.');
    } finally {
      setRefreshing(false);
    }
  };

  if (!stats) {
    return (
      <div className="space-y-6">
        <MaintenanceToggle />
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  const revenueGrowth =
    stats.revenueLastMonth > 0
      ? ((stats.revenueThisMonth - stats.revenueLastMonth) / stats.revenueLastMonth * 100).toFixed(1)
      : 0;

  const ordersGrowth =
    stats.ordersLastMonth > 0
      ? ((stats.ordersThisMonth - stats.ordersLastMonth) / stats.ordersLastMonth * 100).toFixed(1)
      : 0;

  const avgTicket = stats.totalOrders > 0 ? Math.round(stats.totalRevenue / stats.totalOrders) : 0;
  const deliveryRate =
    stats.totalOrders > 0 ? ((stats.deliveredOrders / stats.totalOrders) * 100).toFixed(1) : 0;
  const totalRevenue = paymentMethods.reduce((sum, p) => sum + p.revenue, 0);

  const statusData = [
    { name: 'Pendentes', value: stats.pendingOrders, color: '#f59e0b' },
    { name: 'Enviados', value: stats.shippedOrders, color: '#8b5cf6' },
    { name: 'Entregues', value: stats.deliveredOrders, color: '#22c55e' },
    { name: 'Cancelados', value: stats.cancelledOrders, color: '#ef4444' },
  ].filter(s => s.value > 0);

  const maxProductCount = Math.max(...topProducts.map(p => p.count), 1);

  return (
    <div className="space-y-4">
      {loadError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </p>
      )}

      {/* ── Configurações ── */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SectionHeader title="⚙️ Configurações" open={openConfig} onToggle={() => setOpenConfig(v => !v)} />
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 whitespace-nowrap px-3 py-2 rounded-xl border border-border bg-muted/40 hover:bg-muted/70"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>
      {openConfig && (
        <div className="space-y-4">
          <MaintenanceToggle />
          <WisePaymentSettings />
          <ResetOrdersButton />
        </div>
      )}

      {/* ── Pedidos ── */}
      <SectionHeader title="📦 Pedidos" open={openPedidos} onToggle={() => setOpenPedidos(v => !v)} />
      {openPedidos && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-blue-500" />
                </div>
                {ordersGrowth !== 0 && (
                  <span className={`text-xs font-semibold ${Number(ordersGrowth) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {Number(ordersGrowth) >= 0 ? '▲' : '▼'} {Math.abs(Number(ordersGrowth))}%
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-0.5">Total de Pedidos</p>
              <p className="text-2xl font-bold">{stats.totalOrders}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Este mês: {stats.ordersThisMonth}</p>
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <div className="w-9 h-9 rounded-full bg-yellow-500/10 flex items-center justify-center mb-3">
                <Package className="w-5 h-5 text-yellow-500" />
              </div>
              <p className="text-xs text-muted-foreground mb-0.5">Pendentes</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pendingOrders}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Aguardando ação</p>
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-xs text-muted-foreground mb-0.5">Taxa de Entrega</p>
              <p className="text-2xl font-bold">{deliveryRate}%</p>
              <p className="text-[11px] text-muted-foreground mt-1">{stats.deliveredOrders} de {stats.totalOrders} entregues</p>
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <div className="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center mb-3">
                <Package className="w-5 h-5 text-purple-500" />
              </div>
              <p className="text-xs text-muted-foreground mb-0.5">Enviados</p>
              <p className="text-2xl font-bold text-purple-600">{stats.shippedOrders}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Em trânsito</p>
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-xs text-muted-foreground mb-0.5">Cancelados</p>
              <p className="text-2xl font-bold">{stats.cancelledOrders}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Total cancelado</p>
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mb-0.5">Ticket Médio</p>
              <p className="text-2xl font-bold">¥{avgTicket.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Receita / pedidos</p>
            </div>
          </div>

          {/* Comparativo mensal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-sm text-muted-foreground mb-2">Mês Atual</p>
              <p className="text-2xl font-bold text-primary">¥{stats.revenueThisMonth.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{stats.ordersThisMonth} pedidos</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-sm text-muted-foreground mb-2">Mês Anterior</p>
              <p className="text-2xl font-bold">¥{stats.revenueLastMonth.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{stats.ordersLastMonth} pedidos</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Financeiro ── */}
      <SectionHeader title="💰 Financeiro" open={openFinanceiro} onToggle={() => setOpenFinanceiro(v => !v)} />
      {openFinanceiro && (
        <div className="space-y-4">
          {/* Receita Total */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              {revenueGrowth !== 0 && (
                <span className={`text-xs font-semibold ${Number(revenueGrowth) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Number(revenueGrowth) >= 0 ? '▲' : '▼'} {Math.abs(Number(revenueGrowth))}%
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-0.5">Receita Total (c/ frete)</p>
            <p className="text-2xl font-bold">¥{finance.receitaComFrete.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Este mês: ¥{stats.revenueThisMonth.toLocaleString()}</p>
          </div>

          {/* Breakdown: Produto vs PS vs Frete */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-pink-50 dark:bg-pink-950/20 rounded-xl border border-pink-200 dark:border-pink-800 p-4">
              <p className="text-xs font-semibold text-pink-700 dark:text-pink-400 mb-1">🛒 Receita Produto</p>
              <p className="text-xl font-bold text-pink-700 dark:text-pink-300">¥{finance.receitaProduto.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">S/ frete e s/ PS</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-950/20 rounded-xl border border-orange-200 dark:border-orange-800 p-4">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1">🛍️ Taxa Personal Shopper</p>
              <p className="text-xl font-bold text-orange-700 dark:text-orange-300">¥{finance.receitaPS.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">¥1.000/item</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-800 p-4">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">🚚 Frete</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-300">¥{Math.max(finance.receitaComFrete - finance.receitaSemFrete, 0).toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Não é lucro</p>
            </div>
          </div>

          {/* Custo, Lucro Bruto */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Custo dos Produtos</p>
              <p className="text-xl font-bold text-gray-500">¥{finance.custo.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Quanto você pagou</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Lucro Bruto</p>
              <p className={`text-xl font-bold ${finance.lucro >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>¥{finance.lucro.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Produto − custo</p>
            </div>
          </div>

          {/* Despesas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Comissões Afiliados</p>
              <p className="text-xl font-bold text-orange-500">−¥{(finance.comissoesYen + finance.comissoesConfirmYen).toLocaleString()}</p>
              <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                {finance.comissoesConfirmYen > 0 && <p>Liberadas: ¥{finance.comissoesConfirmYen.toLocaleString()}</p>}
                {finance.comissoesYen > 0 && <p>A liberar: ¥{finance.comissoesYen.toLocaleString()}</p>}
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Marketing</p>
              {finance.marketingBRL > 0 && (
                <p className="text-xl font-bold text-blue-500">−R${finance.marketingBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              )}
              {finance.marketingJPY > 0 && (
                <p className="text-xl font-bold text-blue-500">−¥{finance.marketingJPY.toLocaleString()}</p>
              )}
              {finance.marketingBRL === 0 && finance.marketingJPY === 0 && (
                <p className="text-xl font-bold text-blue-500">−R$ 0,00</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">Ads + influencers</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Salários</p>
              <p className="text-xl font-bold text-red-500">
                {finance.salariosBRL > 0 && `−R$${finance.salariosBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                {finance.salariosBRL > 0 && finance.salariosJPY > 0 && ' / '}
                {finance.salariosJPY > 0 && `−¥${finance.salariosJPY.toLocaleString()}`}
                {finance.salariosBRL === 0 && finance.salariosJPY === 0 && '¥0'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Funcionários</p>
            </div>
          </div>

          {/* Cupons — informativo */}
          {finance.descontosCupomYen > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800 p-4">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">🏷️ Descontos Concedidos (cupons) — informativo</p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-300">≈¥{finance.descontosCupomYen.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Receita que deixou de entrar por cupons. Não afeta o lucro líquido.</p>
            </div>
          )}

          {/* Lucro Líquido */}
          {(() => {
            const YEN_PER_BRL = 28;
            const totalComissoesYen = finance.comissoesYen + finance.comissoesConfirmYen;
            const marketingYen = finance.marketingJPY + Math.round(finance.marketingBRL * YEN_PER_BRL);
            const salariosYen = finance.salariosJPY + Math.round(finance.salariosBRL * YEN_PER_BRL);
            return (
              <div className={`rounded-xl border-2 p-5 ${finance.lucroLiquido >= 0 ? 'bg-green-50 dark:bg-green-950/20 border-green-400 dark:border-green-700' : 'bg-red-50 dark:bg-red-950/20 border-red-400'}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-1">💵 Lucro Líquido</p>
                    <p className={`text-3xl font-bold ${finance.lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ¥{finance.lucroLiquido.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      (Produto + PS) − Custo − Afiliados − Marketing − Salários
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground space-y-0.5">
                    <p>Produto: <span className="font-semibold text-foreground">+¥{finance.receitaProduto.toLocaleString()}</span></p>
                    <p>PS: <span className="font-semibold text-foreground">+¥{finance.receitaPS.toLocaleString()}</span></p>
                    <p>Custo: <span className="font-semibold text-foreground">−¥{finance.custo.toLocaleString()}</span></p>
                    <p>Afiliados: <span className="font-semibold text-foreground">−¥{totalComissoesYen.toLocaleString()}</span></p>
                    <p>Marketing: <span className="font-semibold text-foreground">−¥{marketingYen.toLocaleString()}</span></p>
                    <p>Salários: <span className="font-semibold text-foreground">−¥{salariosYen.toLocaleString()}</span></p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Gráficos & Rankings ── */}
      <SectionHeader title="📊 Gráficos & Rankings" open={openGraficos} onToggle={() => setOpenGraficos(v => !v)} />
      {openGraficos && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-lg mb-1">Financeiro Mensal (¥)</h3>
            <p className="text-xs text-muted-foreground mb-6">Comparação receita com/sem frete, custo e lucro.</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => (typeof value === 'number' ? `¥${value.toLocaleString()}` : value)} />
                <Legend />
                <Bar dataKey="receitaComFrete" name="Receita c/ frete" fill="#fbcfe8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="receitaSemFrete" name="Receita s/ frete" fill="#a855f7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="custo" name="Custo" fill="#9ca3af" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lucro" name="Lucro" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="font-semibold text-lg mb-6">Status dos Pedidos</h3>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} label>
                      {statusData.map((entry: any, idx: number) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-8">Nenhum pedido</p>
              )}
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="font-semibold text-lg mb-6">Receita por Pagamento</h3>
              <div className="space-y-4">
                {paymentMethods.map((method) => {
                  const percent = totalRevenue > 0 ? ((method.revenue / totalRevenue) * 100).toFixed(1) : '0';
                  return (
                    <div key={method.method}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{method.method}</span>
                        <span className="text-sm font-bold">¥{method.revenue.toLocaleString()} ({percent}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="bg-primary rounded-full h-2 transition-all duration-500" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-lg mb-6">Top 5 Produtos</h3>
            {topProducts.length > 0 ? (
              <div className="space-y-4">
                {topProducts.map((product, idx) => (
                  <div key={product.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-primary w-6">#{idx + 1}</span>
                        <span className="text-sm font-medium">{product.name}</span>
                      </div>
                      <span className="text-sm font-bold">{product.count} pedido(s)</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-primary rounded-full h-2 transition-all duration-500" style={{ width: `${(product.count / maxProductCount) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Nenhum produto vendido ainda</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
