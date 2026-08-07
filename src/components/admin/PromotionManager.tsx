import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Tag, Trash2, Save, Search, Users, Clock, CalendarClock, ChevronDown, ChevronUp, Plus, FlaskConical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProducts } from '@/context/ProductsContext';
import { db } from '@/config/firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { ensureAdminAuth } from '@/utils/adminAuth';
import { useToast } from '@/hooks/use-toast';
import { convertYen } from '@/services/fxService';
import { PROMO_TYPES, ActivePromo, ScheduledNextPromo } from '@/types/promotion';
export type { ActivePromo, ScheduledNextPromo };
export { PROMO_TYPES };

// ── Bloco de formulário reutilizável (promoção atual e próxima) ──────────────
interface PromoFormProps {
  label: string;
  products: ReturnType<typeof useProducts>['products'];
  value: Partial<ActivePromo & ScheduledNextPromo>;
  onChange: (v: Partial<ActivePromo & ScheduledNextPromo>) => void;
  showDuration?: boolean;
}

const PromoForm: React.FC<PromoFormProps> = ({ label, products, value, onChange, showDuration = false }) => {
  const [search, setSearch] = useState('');
  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const selected = products.find(p => p.id === value.productId);

  const setOriginalYen = (yen: number) => {
    const pct = value.discountPct ?? 0;
    onChange({ ...value, originalPriceYen: yen, promoPriceYen: Math.round(yen * (1 - pct / 100)) });
  };
  const setDiscountPct = (pct: number) => {
    const oy = value.originalPriceYen ?? 0;
    onChange({ ...value, discountPct: pct, promoPriceYen: Math.round(oy * (1 - pct / 100)) });
  };
  const setPromoYen = (yen: number) => {
    const oy = value.originalPriceYen ?? 0;
    const pct = oy > 0 ? Math.round((1 - yen / oy) * 100) : 0;
    onChange({ ...value, promoPriceYen: yen, discountPct: pct });
  };
  const selectProduct = (id: string) => {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const oy = p.prices?.small ?? 0;
    const pct = value.discountPct ?? 0;
    const promoImage = p.gallery?.[0] || p.image || p.thumbnail || '';
    onChange({ ...value, productId: id, productName: p.name, productImage: promoImage, originalPriceYen: oy, promoPriceYen: Math.round(oy * (1 - pct / 100)) });
    setSearch('');
  };

  const brl = convertYen(value.promoPriceYen ?? 0, 'BRL');
  const originalBrl = convertYen(value.originalPriceYen ?? 0, 'BRL');

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</p>

      {/* Tipo */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Tipo de promoção</label>
        <select value={value.type ?? 'abertura'} onChange={e => onChange({ ...value, type: e.target.value })}
          className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          {PROMO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Produto */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Produto</label>
        {selected && (
          <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg border border-primary/20 mb-1">
            {selected.thumbnail && <img src={selected.thumbnail} alt="" className="w-8 h-8 rounded object-cover" />}
            <span className="text-sm font-medium flex-1 truncate">{selected.name}</span>
            <button onClick={() => onChange({ ...value, productId: '', productName: '', productImage: '' })} className="text-muted-foreground hover:text-destructive text-xs">✕</button>
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        {search && (
          <div className="border border-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
            {filtered.slice(0, 20).map(p => (
              <button key={p.id} onClick={() => selectProduct(p.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary text-sm">
                {p.thumbnail && <img src={p.thumbnail} alt="" className="w-7 h-7 rounded object-cover shrink-0" />}
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">¥{p.prices?.small ?? 0}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Preços em ¥ */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Preço original (¥)</label>
          <input type="number" min="0" value={value.originalPriceYen ?? ''} onChange={e => setOriginalYen(Number(e.target.value))}
            className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          {(value.originalPriceYen ?? 0) > 0 && <div className="text-[10px] text-muted-foreground">≈ R$ {originalBrl.toFixed(2)}</div>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Desconto (%)</label>
          <input type="number" min="0" max="100" value={value.discountPct ?? ''} onChange={e => setDiscountPct(Number(e.target.value))}
            className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="0" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Preço promo (¥)</label>
          <input type="number" min="0" value={value.promoPriceYen ?? ''} onChange={e => setPromoYen(Number(e.target.value))}
            className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          {(value.promoPriceYen ?? 0) > 0 && <div className="text-[10px] text-green-600 font-semibold">≈ R$ {brl.toFixed(2)}</div>}
        </div>
      </div>

      {/* Duração e limite */}
      <div className="grid grid-cols-2 gap-3">
        {showDuration && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Duração (dias)</label>
            <input type="number" min="1" max="365" value={value.durationDays ?? ''} onChange={e => onChange({ ...value, durationDays: e.target.value ? Number(e.target.value) : null })}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Sem limite" />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Limite/pessoa</label>
          <input type="number" min="1" max="99" value={value.limitPerPerson ?? 1} onChange={e => onChange({ ...value, limitPerPerson: Number(e.target.value) })}
            className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">📦 Máx. produtos</label>
          <input type="number" min="1" value={value.maxProducts ?? ''} onChange={e => onChange({ ...value, maxProducts: e.target.value ? Number(e.target.value) : null })}
            className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Ilimitado" />
          <div className="text-[10px] text-muted-foreground">Deixe vazio = ilimitado</div>
        </div>
      </div>
    </div>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────
const emptyForm = (): Partial<ActivePromo & ScheduledNextPromo> => ({
  type: 'abertura', productId: '', productName: '', productImage: '',
  originalPriceYen: 0, promoPriceYen: 0, discountPct: 0, limitPerPerson: 1,
  maxProducts: null, durationDays: null,
});

const PromotionManager: React.FC = () => {
  const { products } = useProducts();
  const { toast } = useToast();
  const [active, setActive] = useState<ActivePromo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ActivePromo & ScheduledNextPromo>>(emptyForm());
  const [showNext, setShowNext] = useState(false);
  const [nextForm, setNextForm] = useState<Partial<ScheduledNextPromo>>(emptyForm());
  const [timeLeft, setTimeLeft] = useState('');

  // Carrega promoção ativa
  useEffect(() => {
    if (!db) { setLoading(false); return; }
    getDoc(doc(db, 'siteContent', 'homePromotion')).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as ActivePromo;
        const expiredByDate = data.expiresAt ? data.expiresAt < Date.now() : false;
        const expiredByQty  = data.maxProducts != null && (data.soldCount ?? 0) >= data.maxProducts;
        if (expiredByDate || expiredByQty) {
          if (data.nextPromo) activateNext(data.nextPromo);
          else removePromo(true);
        } else {
          setActive(data);
        }
      }
    }).finally(() => setLoading(false));
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!active?.expiresAt) { setTimeLeft(''); return; }
    const update = () => {
      const diff = active.expiresAt! - Date.now();
      if (diff <= 0) { setTimeLeft('Encerrada'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${d}d ${h}h ${m}m ${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [active?.expiresAt]);

  const simulateExpiry = async () => {
    if (!db || !active) return;
    setSaving(true);
    try {
      await ensureAdminAuth();
      if (active.nextPromo) {
        const next = active.nextPromo;
        const expiresAt = next.durationDays ? Date.now() + next.durationDays * 86400000 : null;
        const newActive: ActivePromo = { ...next, soldCount: 0, expiresAt, nextPromo: null };
        await setDoc(doc(db, 'siteContent', 'homePromotion'), newActive);
        setActive(newActive);
        const prazo = expiresAt ? `expira em ${next.durationDays}d` : 'sem prazo';
        toast({ title: '✅ Próxima promoção ativada!', description: `${next.productName} — ¥${next.promoPriceYen} · ${prazo}` });
      } else {
        await deleteDoc(doc(db, 'siteContent', 'homePromotion'));
        setActive(null);
        toast({ title: '✅ Simulação concluída', description: 'Nenhuma próxima promoção configurada — promoção removida.' });
      }
    } catch (e: any) {
      toast({ title: 'Erro na simulação', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const activateNext = async (next: ScheduledNextPromo) => {
    if (!db) return;
    try {
      await ensureAdminAuth();
      const expiresAt = next.durationDays ? Date.now() + next.durationDays * 86400000 : null;
      const newActive: ActivePromo = { ...next, soldCount: 0, expiresAt, nextPromo: null };
      await setDoc(doc(db, 'siteContent', 'homePromotion'), newActive);
      setActive(newActive);
    } catch { /* silencia */ }
  };

  const removePromo = async (silent = false) => {
    if (!db) return;
    setSaving(true);
    try {
      await ensureAdminAuth();
      await deleteDoc(doc(db, 'siteContent', 'homePromotion'));
      setActive(null);
      if (!silent) toast({ title: 'Promoção removida.' });
    } catch (e: any) {
      if (!silent) toast({ title: 'Erro', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const save = async () => {
    if (!form.productId || !db) return;
    if (!form.promoPriceYen || form.promoPriceYen <= 0) {
      toast({ title: 'Informe o preço da promoção em ¥', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      await ensureAdminAuth();
      const expiresAt = form.durationDays ? Date.now() + form.durationDays * 86400000 : null;
      const nextPromo: ScheduledNextPromo | null = (showNext && nextForm.productId)
        ? { type: nextForm.type ?? 'abertura', productId: nextForm.productId!, productName: nextForm.productName!, productImage: nextForm.productImage ?? '', originalPriceYen: nextForm.originalPriceYen ?? 0, promoPriceYen: nextForm.promoPriceYen ?? 0, discountPct: nextForm.discountPct ?? 0, limitPerPerson: nextForm.limitPerPerson ?? 1, maxProducts: nextForm.maxProducts ?? null, durationDays: nextForm.durationDays ?? null }
        : null;
      const promo: ActivePromo = {
        type: form.type!, productId: form.productId!, productName: form.productName!, productImage: form.productImage ?? '',
        originalPriceYen: form.originalPriceYen ?? 0, promoPriceYen: form.promoPriceYen!, discountPct: form.discountPct ?? 0,
        limitPerPerson: form.limitPerPerson ?? 1, maxProducts: form.maxProducts ?? null,
        soldCount: active?.productId === form.productId ? (active.soldCount ?? 0) : 0, // mantém contagem se for o mesmo produto
        expiresAt, nextPromo,
      };
      await setDoc(doc(db, 'siteContent', 'homePromotion'), promo);
      setActive(promo);
      setForm(emptyForm());
      setNextForm(emptyForm());
      setShowNext(false);
      toast({ title: 'Promoção ativada!', description: `${form.productName} — ¥${form.promoPriceYen}` });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-muted-foreground animate-pulse">Carregando...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Promoção na Página Inicial</h2>
          <p className="text-sm text-muted-foreground mt-1">Preços em ¥ — convertidos automaticamente para R$/€ conforme o país do cliente.</p>
        </div>
        <Button variant="outline" size="sm" className="border-orange-300 text-orange-600 hover:bg-orange-50 gap-1.5 text-xs shrink-0"
          onClick={async () => {
            if (!db || !active) { toast({ title: 'Nenhuma promoção ativa para resetar.' }); return; }
            try {
              await ensureAdminAuth();
              const resetAt = Date.now();
              await setDoc(doc(db, 'siteContent', 'homePromotion'), { ...active, limitResetAt: resetAt });
              setActive({ ...active, limitResetAt: resetAt });
              // Limpa também o navegador local
              Object.keys(localStorage).filter(k => k.startsWith('promo_bought_')).forEach(k => localStorage.removeItem(k));
              toast({ title: '🔄 Limites resetados para todos os clientes', description: 'Contadores anteriores a agora serão ignorados em qualquer dispositivo.' });
            } catch (e: any) {
              toast({ title: 'Erro', description: e?.message, variant: 'destructive' });
            }
          }}>
          <RotateCcw className="w-3.5 h-3.5" /> Resetar limites de compra
        </Button>
      </div>

      {/* Promoção ativa */}
      {active ? (
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 space-y-3">
          <div className="flex items-center gap-3">
            {active.productImage && <img src={active.productImage} alt="" className="w-14 h-14 rounded-lg object-cover border border-border shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-green-600 uppercase">{PROMO_TYPES.find(t => t.value === active.type)?.label}</div>
              <div className="font-semibold truncate">{active.productName}</div>
              <div className="flex items-center gap-3 text-sm mt-0.5">
                <span className="line-through text-muted-foreground">¥{active.originalPriceYen} · R${convertYen(active.originalPriceYen, 'BRL').toFixed(2)}</span>
                <span className="font-bold text-green-700">¥{active.promoPriceYen} · R${convertYen(active.promoPriceYen, 'BRL').toFixed(2)}</span>
                {active.discountPct > 0 && <span className="bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full">-{active.discountPct}%</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                <span>Limite: {active.limitPerPerson}x/pessoa</span>
                {active.maxProducts != null && (
                  <span className={`font-semibold ${(active.soldCount ?? 0) >= active.maxProducts ? 'text-red-600' : 'text-amber-600'}`}>
                    📦 {active.soldCount ?? 0}/{active.maxProducts} vendidos
                    {(active.soldCount ?? 0) >= active.maxProducts && ' — ESGOTADO'}
                  </span>
                )}
              </div>
              {active.maxProducts != null && (active.soldCount ?? 0) < active.maxProducts && (
                <div className="mt-1">
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden w-full max-w-xs">
                    <div className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, ((active.soldCount ?? 0) / active.maxProducts) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Button variant="destructive" size="sm" onClick={() => removePromo()} disabled={saving}><Trash2 className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" onClick={simulateExpiry} disabled={saving} title="Simular encerramento agora (teste)" className="border-orange-300 text-orange-600 hover:bg-orange-50 text-[10px] px-2 py-1 h-auto gap-1">
                <FlaskConical className="w-3 h-3" />Simular
              </Button>
            </div>
          </div>
          {/* Resumo das condições de encerramento */}
          {(active.expiresAt || active.maxProducts != null) && (
            <div className="text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2 flex flex-wrap gap-3">
              <span className="font-semibold text-foreground">Encerra quando:</span>
              {active.expiresAt && <span>⏱️ Data atingida</span>}
              {active.expiresAt && active.maxProducts != null && <span className="text-muted-foreground/60">ou</span>}
              {active.maxProducts != null && <span>📦 Estoque ({active.maxProducts} un.) esgotado</span>}
              {active.expiresAt && active.maxProducts != null && <span className="font-semibold text-primary">— o que ocorrer primeiro</span>}
            </div>
          )}

          {active.expiresAt && (
            <div className={`flex items-center gap-2 text-sm font-medium ${timeLeft === 'Encerrada' ? 'text-red-600' : 'text-orange-600'}`}>
              <Clock className="w-4 h-4 shrink-0" />
              {timeLeft === 'Encerrada' ? 'Promoção encerrada' : `Encerra em: ${timeLeft}`}
              <span className="text-xs text-muted-foreground font-normal">({new Date(active.expiresAt).toLocaleDateString('pt-BR')})</span>
            </div>
          )}
          {active.nextPromo && (
            <div className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2 flex items-center gap-2">
              <CalendarClock className="w-3.5 h-3.5 shrink-0" />
              Próxima: {PROMO_TYPES.find(t => t.value === active.nextPromo!.type)?.label} — {active.nextPromo.productName} (¥{active.nextPromo.promoPriceYen})
            </div>
          )}
          <a href="/promocao" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">Ver página da promoção →</a>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground text-center">Nenhuma promoção ativa.</div>
      )}

      {/* Formulário nova promoção */}
      <div className="border border-border rounded-xl p-5 space-y-6">
        <h3 className="font-semibold flex items-center gap-2"><Tag className="w-4 h-4" /> Nova promoção</h3>
        <PromoForm label="Promoção atual" products={products} value={form} onChange={setForm} showDuration />

        {/* Próxima promoção (pré-programada) */}
        <div className="border-t border-border pt-4">
          <button onClick={() => setShowNext(s => !s)} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80">
            <CalendarClock className="w-4 h-4" />
            {showNext ? 'Remover próxima promoção' : 'Pré-programar próxima promoção'}
            {showNext ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showNext && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-200 space-y-4">
              <p className="text-xs text-blue-600 font-medium">Ativa automaticamente quando a promoção atual expirar.</p>
              <PromoForm label="Próxima promoção" products={products} value={nextForm} onChange={setNextForm} showDuration />
            </div>
          )}
        </div>

        <Button onClick={save} disabled={!form.productId || !form.promoPriceYen || saving} className="w-full gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Ativar promoção na página inicial'}
        </Button>
      </div>
    </div>
  );
};

export default PromotionManager;
