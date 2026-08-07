import React, { useEffect, useState } from 'react';
import { db } from '@/config/firebase';
import {
  collection, addDoc, deleteDoc, doc, getDocs, query, orderBy,
} from 'firebase/firestore';
import { Trash2, Plus, Megaphone, Users, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export interface MarketingExpense {
  id?: string;
  date: string;
  amount: number;
  currency: 'BRL' | 'JPY';
  type: 'ads' | 'influencer';
  platform: string;
  description?: string;
  createdAt?: string;
}

const PLATFORMS_ADS = ['Instagram Ads', 'Facebook Ads', 'TikTok Ads', 'Google Ads', 'YouTube Ads', 'Outro'];
const PLATFORMS_INF = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'X (Twitter)', 'Outro'];

const COL = 'marketing_expenses';

export async function getMarketingExpenses(): Promise<MarketingExpense[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, COL), orderBy('date', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as MarketingExpense));
  } catch { return []; }
}

const empty = (): Omit<MarketingExpense, 'id' | 'createdAt'> => ({
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  currency: 'BRL',
  type: 'ads',
  platform: '',
  description: '',
});

const MarketingManager: React.FC = () => {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<MarketingExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(empty());
  const [filterType, setFilterType] = useState<'all' | 'ads' | 'influencer'>('all');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setExpenses(await getMarketingExpenses());
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.platform || form.amount <= 0) {
      toast({ title: 'Preencha plataforma/pessoa e valor', variant: 'destructive' });
      return;
    }
    if (!db) return;
    setSaving(true);
    try {
      await addDoc(collection(db, COL), { ...form, createdAt: new Date().toISOString() });
      toast({ title: 'Gasto registrado!' });
      setForm(empty());
      await load();
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!db) return;
    await deleteDoc(doc(db, COL, id));
    setExpenses(prev => prev.filter(e => e.id !== id));
    toast({ title: 'Gasto removido' });
  };

  const filtered = filterType === 'all' ? expenses : expenses.filter(e => e.type === filterType);

  const totalBRL = filtered.filter(e => e.currency === 'BRL').reduce((s, e) => s + e.amount, 0);
  const totalJPY = filtered.filter(e => e.currency === 'JPY').reduce((s, e) => s + e.amount, 0);

  const adsBRL = expenses.filter(e => e.type === 'ads' && e.currency === 'BRL').reduce((s, e) => s + e.amount, 0);
  const adsJPY = expenses.filter(e => e.type === 'ads' && e.currency === 'JPY').reduce((s, e) => s + e.amount, 0);
  const infBRL = expenses.filter(e => e.type === 'influencer' && e.currency === 'BRL').reduce((s, e) => s + e.amount, 0);
  const infJPY = expenses.filter(e => e.type === 'influencer' && e.currency === 'JPY').reduce((s, e) => s + e.amount, 0);

  const platforms = form.type === 'ads' ? PLATFORMS_ADS : PLATFORMS_INF;

  return (
    <div className="space-y-6">

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-2">
            <Megaphone className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Impulsionamento / Ads</span>
          </div>
          <p className="text-2xl font-bold">R$ {adsBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          {adsJPY > 0 && <p className="text-sm text-muted-foreground mt-1">+ ¥{adsJPY.toLocaleString()}</p>}
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-purple-500" />
            <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">Influencers</span>
          </div>
          <p className="text-2xl font-bold">R$ {infBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          {infJPY > 0 && <p className="text-sm text-muted-foreground mt-1">+ ¥{infJPY.toLocaleString()}</p>}
        </div>
        <div className="bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-400">Total Marketing</span>
          </div>
          <p className="text-2xl font-bold text-red-600">R$ {(adsBRL + infBRL).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          {(adsJPY + infJPY) > 0 && <p className="text-sm text-red-500 mt-1">+ ¥{(adsJPY + infJPY).toLocaleString()}</p>}
        </div>
      </div>

      {/* Formulário novo gasto */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5" /> Registrar Gasto
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as 'ads' | 'influencer', platform: '' }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="ads">📢 Impulsionamento / Ads</option>
              <option value="influencer">🤳 Influencer / Criador</option>
            </select>
          </div>

          {/* Plataforma / Pessoa */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {form.type === 'ads' ? 'Plataforma' : 'Pessoa / Canal'}
            </label>
            <input
              list="platform-options"
              value={form.platform}
              onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
              placeholder={form.type === 'ads' ? 'Ex: Instagram Ads' : 'Ex: @usuario_tiktok'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <datalist id="platform-options">
              {platforms.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* Data */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Data</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Valor */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount || ''}
              onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              placeholder="0,00"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Moeda */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Moeda</label>
            <select
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value as 'BRL' | 'JPY' }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="BRL">BRL (R$)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição (opcional)</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ex: stories 3 dias, campanha verão..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? 'Salvando...' : 'Adicionar Gasto'}
        </Button>
      </div>

      {/* Lista */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-semibold text-lg">Histórico</h3>
          <div className="flex gap-2">
            {(['all', 'ads', 'influencer'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  filterType === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t === 'all' ? 'Todos' : t === 'ads' ? 'Ads' : 'Influencer'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhum gasto registrado</p>
        ) : (
          <div className="space-y-3">
            {/* Total filtrado */}
            {filtered.length > 0 && (
              <div className="flex justify-end text-sm text-muted-foreground mb-2">
                Total filtrado:
                {totalBRL > 0 && <span className="font-semibold ml-1">R$ {totalBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                {totalJPY > 0 && <span className="font-semibold ml-1">¥{totalJPY.toLocaleString()}</span>}
              </div>
            )}

            {filtered.map(e => (
              <div key={e.id} className="flex items-start justify-between gap-3 border border-border rounded-lg p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-xl shrink-0">{e.type === 'ads' ? '📢' : '🤳'}</span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{e.platform}</p>
                    {e.description && <p className="text-xs text-muted-foreground truncate">{e.description}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(e.date).toLocaleDateString('pt-BR')}
                      {' · '}
                      <span className={`font-semibold ${e.type === 'ads' ? 'text-blue-600' : 'text-purple-600'}`}>
                        {e.type === 'ads' ? 'Ads' : 'Influencer'}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-sm">
                    {e.currency === 'BRL'
                      ? `R$ ${e.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : `¥${e.amount.toLocaleString()}`}
                  </span>
                  <button
                    onClick={() => e.id && handleDelete(e.id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketingManager;
