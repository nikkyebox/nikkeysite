import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRates, loadFxRates, convertYen, getRateSource } from '@/services/fxService';
import { formatPrice } from '@/utils/currency';
import { getELightRate, getAirParcelRate, getEmsRate, type JapanPostZone } from '@/utils/japanPostRates';
import { calcBrazilTax, icmsRateFromCep, EU_VAT_RATES, calcUsSalesTax, US_SALES_TAX } from '@/utils/taxRules';

interface ProductRow {
  id: number;
  costYen: string;
  discountPct: string;
}

const AdminCalculator: React.FC = () => {
  const nextId = useRef(2);
  const [rows, setRows] = useState<ProductRow[]>([{ id: 1, costYen: '', discountPct: '0' }]);
  const [psQty, setPsQty] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [zone, setZone] = useState<JapanPostZone>(5);

  // ── Imposto de importação (destino) ──
  const [taxDest, setTaxDest] = useState<'BR' | 'EU' | 'US' | 'none'>('BR');
  const [cep, setCep] = useState('');
  const [euCountry, setEuCountry] = useState<keyof typeof EU_VAT_RATES>('Portugal');
  const [usState, setUsState] = useState('CA');
  const [includeFreight, setIncludeFreight] = useState(false);
  const [freightIdx, setFreightIdx] = useState(0);

  // Cotação ao vivo (Wise): usa EXATAMENTE o mesmo convertYen() do carrinho/checkout,
  // então o Total da calculadora bate com o que o cliente paga. Recarrega a cada 5 min
  // e tem botão manual de atualização para confirmar que está ao vivo.
  const [rates, setRates] = useState(getRates());
  const [rateSource, setRateSource] = useState(getRateSource());
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = () => {
    setRefreshing(true);
    loadFxRates()
      .then(r => { setRates(r); setRateSource(getRateSource()); })
      .finally(() => setTimeout(() => setRefreshing(false), 400));
  };
  useEffect(() => {
    let alive = true;
    const refresh = () => loadFxRates().then(r => { if (alive) { setRates(r); setRateSource(getRateSource()); } });
    refresh();
    const t = setInterval(refresh, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Margem de segurança de 5% (mesma lógica do carrinho: 5 ienes por cada 100 de
  // valor). Garante que o orçamento da calculadora fique igual ou ACIMA do valor
  // que o carrinho cobra — o admin nunca cobra a menos ao usar a calculadora.
  const SAFETY_MARGIN = 0.05;
  const sellPrice = (row: ProductRow) => {
    const cost = parseFloat(row.costYen) || 0;
    const disc = Math.min(Math.max(parseFloat(row.discountPct) || 0, 0), 50);
    return cost * 2 * (1 - disc / 100) * (1 + SAFETY_MARGIN);
  };

  const totalYen = useMemo(() => rows.reduce((s, r) => s + sellPrice(r), 0), [rows]);
  const totalCostYen = useMemo(() => rows.reduce((s, r) => s + (parseFloat(r.costYen) || 0), 0), [rows]);

  // Taxa Personal Shopper AUTOMÁTICA: 1 item por input box (linha de produto).
  // Se o admin digitar um valor manual no campo, ele sobrepõe a contagem automática.
  const effPsQty = psQty.trim() === '' ? rows.length : (parseInt(psQty) || 0);
  const psFeeYen = effPsQty * 1000;
  const grandTotalYen = totalYen + psFeeYen;
  const profitYen = grandTotalYen - totalCostYen;

  // Conversão consistente com o checkout: convertYen() usa a taxa da Wise ao vivo
  // + buffer de margem, exatamente como o carrinho. Produtos levam buffer por linha
  // (como no carrinho); PS e frete são taxas fixas (sem buffer).
  const productsBrl = rows.reduce((s, r) => s + convertYen(sellPrice(r), 'BRL'), 0);
  const productsEur = rows.reduce((s, r) => s + convertYen(sellPrice(r), 'EUR'), 0);
  const psBrl = convertYen(psFeeYen, 'BRL', true);
  const psEur = convertYen(psFeeYen, 'EUR', true);
  const productsUsd = rows.reduce((s, r) => s + convertYen(sellPrice(r), 'USD'), 0);
  const psUsd = convertYen(psFeeYen, 'USD', true);
  const subtotalBrl = productsBrl + psBrl;
  const subtotalEur = productsEur + psEur;
  const subtotalUsd = productsUsd + psUsd;
  const profitBrl = convertYen(profitYen, 'BRL', true);
  const profitEur = convertYen(profitYen, 'EUR', true);

  const addRow = () => {
    setRows(prev => [...prev, { id: nextId.current++, costYen: '', discountPct: '0' }]);
  };
  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id));
  const updateRow = (id: number, field: keyof Omit<ProductRow, 'id'>, value: string) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const weightG = Math.round((parseFloat(weightKg) || 0) * 1000);
  const isLight = weightG > 0 && weightG <= 2000;
  const overLimit = weightG > 30000;
  const eRaitoYen = isLight ? getELightRate(weightG, zone) : null;
  const kAirYen = !isLight && weightG > 2000 && !overLimit ? getAirParcelRate(weightG, zone) : null;
  const emsYen  = !overLimit ? getEmsRate(weightG, zone) : null;

  const yenFmt = (y: number) => `¥${Math.round(y).toLocaleString('ja-JP')}`;

  const shippingOptions: { label: string; yen: number }[] = [];
  if (eRaitoYen != null) shippingOptions.push({ label: '✉️ e-Packet Light (≤2kg)', yen: eRaitoYen });
  if (emsYen    != null) shippingOptions.push({ label: '🚀 EMS', yen: emsYen });
  if (kAirYen   != null) shippingOptions.push({ label: '✈️ Air Parcel', yen: kAirYen });

  // ── Imposto de importação sobre produtos + Personal Shopper (+ frete opcional) ──
  // A base pode incluir o frete (valor CIF) quando "Incluir frete" está marcado.
  // Brasil: 60% federal (Remessa Conforme) + ICMS da UF do CEP.
  // Europa: IVA/VAT do país. EUA: sales tax do estado.
  const selFreight = includeFreight && shippingOptions.length > 0
    ? shippingOptions[Math.min(freightIdx, shippingOptions.length - 1)]
    : null;
  const freightYen = selFreight ? selFreight.yen : 0;
  const freightBrl = convertYen(freightYen, 'BRL', true);
  const freightEur = convertYen(freightYen, 'EUR', true);
  const freightUsd = convertYen(freightYen, 'USD', true);

  const taxBaseBrl = subtotalBrl + freightBrl;
  const taxBaseEur = subtotalEur + freightEur;
  const taxBaseUsd = subtotalUsd + freightUsd;

  const { uf, rate: icmsRate } = icmsRateFromCep(cep);
  const brTax = calcBrazilTax(taxBaseBrl, icmsRate); // { federal, icms, total }
  const euRate = EU_VAT_RATES[euCountry] ?? 0.20;
  const euTax = taxBaseEur * euRate;
  const usRate = US_SALES_TAX[usState] ?? 0;
  const usTax = calcUsSalesTax(taxBaseUsd, usState);

  const totalWithTaxBrl = taxBaseBrl + brTax.total;
  const totalWithTaxEur = taxBaseEur + euTax;
  const totalWithTaxUsd = taxBaseUsd + usTax;

  return (
    <div className="space-y-6 pb-8">

      {/* ── Cotação ao vivo (Wise) ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-card rounded-xl border border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${rateSource === 'wise' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : rateSource === 'cache' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${rateSource === 'wise' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {rateSource === 'wise' ? 'Wise ao vivo' : rateSource === 'cache' ? 'Wise (cache)' : 'Cotação aproximada'}
          </span>
          <span className="text-muted-foreground">
            ¥1 = <strong className="text-foreground">R$ {rates.BRL.toFixed(4)}</strong> · <strong className="text-foreground">€ {rates.EUR.toFixed(4)}</strong>
          </span>
        </div>
        <button onClick={doRefresh} disabled={refreshing} className="text-xs font-semibold text-primary hover:opacity-70 disabled:opacity-40 flex items-center gap-1">
          <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span> {refreshing ? 'Atualizando…' : 'Atualizar agora'}
        </button>
      </div>

      {/* ── Produtos ── */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">🛒 Produtos</h3>
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>

        {/* Cabeçalho das colunas */}
        <div className="grid grid-cols-[1fr_90px_1.6fr_20px] gap-2 mb-1 px-1">
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Custo (¥)</span>
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Desconto (máx 50%)</span>
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Preço de venda</span>
          <span />
        </div>

        <div className="space-y-2">
          {rows.map((row) => {
            const sell = sellPrice(row);
            return (
              <div key={row.id} className="grid grid-cols-[1fr_90px_1.6fr_20px] gap-2 items-center">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">¥</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={row.costYen}
                    onChange={e => updateRow(row.id, 'costYen', e.target.value)}
                    className="pl-7 pr-2 py-2 rounded-lg border border-border bg-background text-sm w-full"
                  />
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    placeholder="0"
                    value={row.discountPct}
                    onChange={e => updateRow(row.id, 'discountPct', e.target.value)}
                    className="px-2 py-2 pr-6 rounded-lg border border-border bg-background text-sm w-full text-center"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                </div>
                <div className={`rounded-lg px-3 py-2 text-sm min-h-[38px] flex items-center ${sell > 0 ? 'bg-primary/8 border border-primary/20' : 'bg-secondary/30'}`}>
                  {sell > 0 ? (
                    <span>
                      <span className="font-black text-primary">{yenFmt(sell)}</span>
                      <span className="text-[11px] text-muted-foreground ml-1.5">
                        {formatPrice(convertYen(sell, 'BRL'), 'BRL', true)} · {formatPrice(convertYen(sell, 'EUR'), 'EUR', true)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
                <button
                  onClick={() => rows.length > 1 && removeRow(row.id)}
                  disabled={rows.length === 1}
                  className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-20"
                  title="Remover"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Taxa Personal Shopper ── */}
      <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4">
        <p className="text-[11px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wide mb-3">🛍️ Taxa Personal Shopper (¥1.000/item) — automática: 1 por item</p>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-orange-600 dark:text-orange-400 font-medium">
              Qtd de itens <span className="opacity-70">(auto = {rows.length}; edite para sobrepor)</span>
            </label>
            <input
              type="number"
              min="0"
              value={psQty}
              onChange={e => setPsQty(e.target.value)}
              placeholder={String(rows.length)}
              className="w-32 border border-orange-300 dark:border-orange-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          {psFeeYen > 0 && (
            <div className="mt-4 flex gap-4 text-sm font-semibold text-orange-700 dark:text-orange-300">
              <span>{yenFmt(psFeeYen)}</span>
              <span>{formatPrice(psBrl, 'BRL', true)}</span>
              <span>{formatPrice(psEur, 'EUR', true)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Detalhamento (transparência da soma) ── */}
      {totalYen > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">🧮 Detalhamento da soma</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Produtos (preço de venda × qtd de linhas)</span>
              <span className="font-bold text-foreground">{yenFmt(totalYen)}</span>
            </div>
            {psFeeYen > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa Personal Shopper ({effPsQty} × ¥1.000)</span>
                <span className="font-bold text-orange-600 dark:text-orange-400">{yenFmt(psFeeYen)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1.5 mt-1.5">
              <span className="font-semibold">Subtotal (produtos + PS)</span>
              <span className="font-black text-primary text-base">{yenFmt(grandTotalYen)}</span>
            </div>
            {/* Adendo: total de itens + subtotal em R$ e € */}
            <div className="grid grid-cols-3 gap-2 border-t border-border pt-2 mt-2">
              <div className="text-center">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Total itens</p>
                <p className="font-black text-foreground">{rows.length}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Total Real</p>
                <p className="font-black text-green-600 dark:text-green-400">{formatPrice(subtotalBrl, 'BRL', true)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Total Euro</p>
                <p className="font-black text-blue-600 dark:text-blue-400">{formatPrice(subtotalEur, 'EUR', true)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Imposto de importação (destino) ── */}
      <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-2xl p-5">
        <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wide mb-3">🏛️ Imposto de importação (destino)</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {([
            { d: 'BR', label: '🇧🇷 Brasil (60% + ICMS)' },
            { d: 'EU', label: '🇪🇺 Europa (IVA)' },
            { d: 'US', label: '🇺🇸 EUA (Sales Tax)' },
            { d: 'none', label: 'Sem imposto' },
          ] as { d: 'BR' | 'EU' | 'US' | 'none'; label: string }[]).map(({ d, label }) => (
            <button
              key={d}
              onClick={() => setTaxDest(d)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${taxDest === d ? 'bg-rose-600 text-white border-rose-600' : 'border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Incluir frete na base do imposto (valor CIF) */}
        {taxDest !== 'none' && shippingOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
            <label className="inline-flex items-center gap-2 font-medium text-rose-700 dark:text-rose-300">
              <input type="checkbox" checked={includeFreight} onChange={e => setIncludeFreight(e.target.checked)} className="accent-rose-600" />
              Incluir frete na base (CIF)
            </label>
            {includeFreight && (
              <select
                value={freightIdx}
                onChange={e => setFreightIdx(Number(e.target.value))}
                className="border border-rose-300 dark:border-rose-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                {shippingOptions.map((opt, i) => (
                  <option key={opt.label} value={i}>{opt.label} — {yenFmt(opt.yen)}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Brasil: CEP → UF → ICMS */}
        {taxDest === 'BR' && (
          <div className="space-y-3">
            <div className="flex flex-col gap-1 max-w-xs">
              <label className="text-xs text-rose-600 dark:text-rose-400 font-medium">CEP de destino (define o ICMS do estado)</label>
              <input
                type="text"
                inputMode="numeric"
                value={cep}
                onChange={e => setCep(e.target.value)}
                placeholder="01000-000"
                className="w-40 border border-rose-300 dark:border-rose-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
              <span className="text-[11px] text-rose-600 dark:text-rose-400">
                {uf ? `Estado: ${uf} · ICMS ${(icmsRate * 100).toFixed(1)}%` : `CEP incompleto — usando ICMS médio ${(icmsRate * 100).toFixed(1)}%`}
              </span>
            </div>
            {taxBaseBrl > 0 && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between max-w-md"><span className="text-muted-foreground">Base (produtos + PS{includeFreight ? ' + frete' : ''})</span><span className="font-semibold">{formatPrice(taxBaseBrl, 'BRL', true)}</span></div>
                <div className="flex justify-between max-w-md"><span className="text-muted-foreground">Imposto federal (60%)</span><span className="font-semibold">{formatPrice(brTax.federal, 'BRL', true)}</span></div>
                <div className="flex justify-between max-w-md"><span className="text-muted-foreground">ICMS {uf ? `(${uf})` : ''} {(icmsRate * 100).toFixed(1)}%</span><span className="font-semibold">{formatPrice(brTax.icms, 'BRL', true)}</span></div>
                <div className="flex justify-between max-w-md border-t border-rose-200 dark:border-rose-800 pt-1"><span className="font-bold text-rose-700 dark:text-rose-300">Total impostos</span><span className="font-black text-rose-700 dark:text-rose-300">{formatPrice(brTax.total, 'BRL', true)}</span></div>
              </div>
            )}
          </div>
        )}

        {/* Europa: IVA por país */}
        {taxDest === 'EU' && (
          <div className="space-y-3">
            <div className="flex flex-col gap-1 max-w-xs">
              <label className="text-xs text-rose-600 dark:text-rose-400 font-medium">País (define a alíquota do IVA)</label>
              <select
                value={euCountry}
                onChange={e => setEuCountry(e.target.value as keyof typeof EU_VAT_RATES)}
                className="w-48 border border-rose-300 dark:border-rose-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                {Object.entries(EU_VAT_RATES).map(([c, r]) => (
                  <option key={c} value={c}>{c} — IVA {(r * 100).toFixed(0)}%</option>
                ))}
              </select>
            </div>
            {taxBaseEur > 0 && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between max-w-md"><span className="text-muted-foreground">Base (produtos + PS{includeFreight ? ' + frete' : ''})</span><span className="font-semibold">{formatPrice(taxBaseEur, 'EUR', true)}</span></div>
                <div className="flex justify-between max-w-md border-t border-rose-200 dark:border-rose-800 pt-1"><span className="font-bold text-rose-700 dark:text-rose-300">IVA {euCountry} ({(euRate * 100).toFixed(0)}%)</span><span className="font-black text-rose-700 dark:text-rose-300">{formatPrice(euTax, 'EUR', true)}</span></div>
              </div>
            )}
          </div>
        )}

        {/* EUA: sales tax por estado */}
        {taxDest === 'US' && (
          <div className="space-y-3">
            <div className="flex flex-col gap-1 max-w-xs">
              <label className="text-xs text-rose-600 dark:text-rose-400 font-medium">Estado (define o sales tax)</label>
              <select
                value={usState}
                onChange={e => setUsState(e.target.value)}
                className="w-48 border border-rose-300 dark:border-rose-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                {Object.entries(US_SALES_TAX).map(([st, r]) => (
                  <option key={st} value={st}>{st} — {(r * 100).toFixed(2)}%</option>
                ))}
              </select>
            </div>
            {taxBaseUsd > 0 && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between max-w-md"><span className="text-muted-foreground">Base (produtos + PS{includeFreight ? ' + frete' : ''})</span><span className="font-semibold">{formatPrice(taxBaseUsd, 'USD', true)}</span></div>
                <div className="flex justify-between max-w-md border-t border-rose-200 dark:border-rose-800 pt-1"><span className="font-bold text-rose-700 dark:text-rose-300">Sales Tax {usState} ({(usRate * 100).toFixed(2)}%)</span><span className="font-black text-rose-700 dark:text-rose-300">{formatPrice(usTax, 'USD', true)}</span></div>
              </div>
            )}
          </div>
        )}

        {/* Total com imposto */}
        {taxDest !== 'none' && grandTotalYen > 0 && (
          <div className="mt-4 pt-3 border-t border-rose-200 dark:border-rose-800 flex flex-wrap gap-6">
            {taxDest === 'BR' && (
              <div>
                <p className="text-[11px] uppercase font-bold text-rose-600 dark:text-rose-400">Total c/ imposto (R$)</p>
                <p className="text-2xl font-black text-rose-800 dark:text-rose-200">{formatPrice(totalWithTaxBrl, 'BRL', true)}</p>
              </div>
            )}
            {taxDest === 'EU' && (
              <div>
                <p className="text-[11px] uppercase font-bold text-rose-600 dark:text-rose-400">Total c/ imposto (€)</p>
                <p className="text-2xl font-black text-rose-800 dark:text-rose-200">{formatPrice(totalWithTaxEur, 'EUR', true)}</p>
              </div>
            )}
            {taxDest === 'US' && (
              <div>
                <p className="text-[11px] uppercase font-bold text-rose-600 dark:text-rose-400">Total c/ imposto ($)</p>
                <p className="text-2xl font-black text-rose-800 dark:text-rose-200">{formatPrice(totalWithTaxUsd, 'USD', true)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Totais (produtos + PS fee) ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-center">
          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 mb-1 uppercase tracking-wide">Total em Ienes</p>
          <p className="text-2xl font-black text-amber-900 dark:text-amber-200">{yenFmt(grandTotalYen)}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-2xl p-4 text-center">
          <p className="text-[11px] font-bold text-green-700 dark:text-green-400 mb-1 uppercase tracking-wide">Total em Reais</p>
          <p className="text-2xl font-black text-green-900 dark:text-green-200">{formatPrice(subtotalBrl, 'BRL', true)}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-center">
          <p className="text-[11px] font-bold text-blue-700 dark:text-blue-400 mb-1 uppercase tracking-wide">Total em Euro</p>
          <p className="text-2xl font-black text-blue-900 dark:text-blue-200">{formatPrice(subtotalEur, 'EUR', true)}</p>
        </div>
      </div>

      {/* ── Lucro ── */}
      <div className="bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-400 dark:border-emerald-700 rounded-2xl p-5">
        <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-3">💰 Lucro (venda − custo)</p>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-0.5">Em Ienes</p>
            <p className="text-3xl font-black text-emerald-800 dark:text-emerald-200">{yenFmt(profitYen)}</p>
          </div>
          <div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-0.5">Em Reais</p>
            <p className="text-3xl font-black text-emerald-800 dark:text-emerald-200">{formatPrice(profitBrl, 'BRL', true)}</p>
          </div>
          <div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-0.5">Em Euro</p>
            <p className="text-3xl font-black text-emerald-800 dark:text-emerald-200">{formatPrice(profitEur, 'EUR', true)}</p>
          </div>
        </div>
      </div>

      {/* ── Frete ── */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="font-bold text-lg flex items-center gap-2 mb-4">✈️ Frete Japan Post</h3>

        <div className="flex flex-wrap gap-4 mb-5">
          {/* Peso */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground block mb-1 uppercase">Peso total</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="0.0"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
                className="px-3 py-2 pr-9 rounded-lg border border-border bg-background text-sm w-36"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">kg</span>
            </div>
          </div>

          {/* Destino */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground block mb-1 uppercase">Destino</label>
            <div className="flex flex-wrap gap-2">
              {([
                { z: 1, label: '🇨🇳 Zona 1', desc: 'China/Coreia/Taiwan' },
                { z: 2, label: '🌏 Zona 2', desc: 'Ásia' },
                { z: 3, label: '🇪🇺 Zona 3', desc: 'Europa/Oceânia' },
                { z: 4, label: '🇺🇸 Zona 4', desc: 'EUA/Guam' },
                { z: 5, label: '🇧🇷 Zona 5', desc: 'Brasil/América do Sul' },
              ] as { z: JapanPostZone; label: string; desc: string }[]).map(({ z, label, desc }) => (
                <button
                  key={z}
                  onClick={() => setZone(z)}
                  title={desc}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${zone === z ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resultados de frete */}
        {weightG === 0 && (
          <p className="text-sm text-muted-foreground">Digite o peso para ver as tarifas.</p>
        )}

        {overLimit && (
          <p className="text-sm text-red-500 font-semibold">⚠️ Peso excede o limite de 30 kg do Kozutsumi.</p>
        )}

        {isLight && eRaitoYen != null && (
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
            <span className="inline-block text-[10px] font-black text-emerald-700 bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 rounded-full mb-2">
              📦 e-Raito Light — até 2 kg
            </span>
            <p className="text-2xl font-black text-emerald-800 dark:text-emerald-200">
              {yenFmt(eRaitoYen)}
            </p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
              ≈ {formatPrice(convertYen(eRaitoYen, 'BRL', true), 'BRL', true)} · {formatPrice(convertYen(eRaitoYen, 'EUR', true), 'EUR', true)}
            </p>
          </div>
        )}

        {!isLight && !overLimit && weightG > 2000 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {kAirYen != null && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <span className="inline-block text-[10px] font-black text-blue-700 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded-full mb-2">
                  ✈️ Kozutsumi Aéreo
                </span>
                <p className="text-2xl font-black text-blue-800 dark:text-blue-200">{yenFmt(kAirYen)}</p>
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                  ≈ {formatPrice(convertYen(kAirYen, 'BRL', true), 'BRL', true)} · {formatPrice(convertYen(kAirYen, 'EUR', true), 'EUR', true)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Total Geral (produtos + PS fee + frete) ── */}
      {shippingOptions.length > 0 && grandTotalYen > 0 && (
        <div className="bg-gray-900 dark:bg-gray-950 rounded-2xl p-5 border-2 border-gray-700">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-4">🧾 Total Geral (produtos + PS + frete)</p>
          <div className="space-y-4">
            {shippingOptions.map(opt => {
              const total = grandTotalYen + opt.yen;
              // Conversão idêntica à do checkout: subtotal (produtos+PS) + frete (taxa, sem buffer).
              const totalBrl = subtotalBrl + convertYen(opt.yen, 'BRL', true);
              const totalEur = subtotalEur + convertYen(opt.yen, 'EUR', true);

              // Base de imposto CIF desta opção = produtos + PS + este frete, na moeda do destino.
              // Usa o destino/CEP preenchidos acima para mostrar o total COM imposto.
              let taxLine: { cur: 'BRL' | 'EUR' | 'USD'; base: number; tax: number; withTax: number; label: string } | null = null;
              if (taxDest === 'BR') {
                const base = subtotalBrl + convertYen(opt.yen, 'BRL', true);
                const t = calcBrazilTax(base, icmsRate).total;
                taxLine = { cur: 'BRL', base, tax: t, withTax: base + t, label: `Imposto Brasil (60% + ICMS ${(icmsRate * 100).toFixed(1)}%)` };
              } else if (taxDest === 'EU') {
                const base = subtotalEur + convertYen(opt.yen, 'EUR', true);
                const t = base * euRate;
                taxLine = { cur: 'EUR', base, tax: t, withTax: base + t, label: `IVA ${euCountry} (${(euRate * 100).toFixed(0)}%)` };
              } else if (taxDest === 'US') {
                const base = subtotalUsd + convertYen(opt.yen, 'USD', true);
                const t = calcUsSalesTax(base, usState);
                taxLine = { cur: 'USD', base, tax: t, withTax: base + t, label: `Sales Tax ${usState} (${(usRate * 100).toFixed(2)}%)` };
              }

              return (
                <div key={opt.label} className="border-b border-gray-700 last:border-0 pb-3 last:pb-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <span className="text-xs font-bold text-gray-400 w-40 shrink-0">{opt.label}</span>
                    <div className="flex gap-4 flex-wrap">
                      <span className="text-xl font-black text-white">{yenFmt(total)}</span>
                      <span className="text-xl font-black text-green-400">{formatPrice(totalBrl, 'BRL', true)}</span>
                      <span className="text-xl font-black text-blue-400">{formatPrice(totalEur, 'EUR', true)}</span>
                    </div>
                  </div>
                  {taxLine && (
                    <div className="mt-2 sm:ml-40 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <p className="text-gray-500 uppercase font-bold text-[10px]">Sem imposto</p>
                        <p className="font-bold text-gray-300">{formatPrice(taxLine.base, taxLine.cur, true)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 uppercase font-bold text-[10px]">{taxLine.label}</p>
                        <p className="font-bold text-rose-400">+ {formatPrice(taxLine.tax, taxLine.cur, true)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 uppercase font-bold text-[10px]">Total c/ imposto</p>
                        <p className="font-black text-rose-300 text-sm">{formatPrice(taxLine.withTax, taxLine.cur, true)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {taxDest === 'none' && (
            <p className="mt-3 text-[11px] text-gray-500">💡 Selecione o destino e preencha o CEP na seção de imposto acima para ver o total com/sem imposto por frete.</p>
          )}
        </div>
      )}

    </div>
  );
};

export default AdminCalculator;
