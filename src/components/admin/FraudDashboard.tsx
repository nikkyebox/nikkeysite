import React, { useEffect, useState } from 'react';
import { db } from '@/config/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ShieldAlert, ShieldCheck, Eye, Trash2, AlertTriangle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { normalizeCPF } from '@/utils/validation';
import CpfMigration from './CpfMigration';

interface FraudAttempt {
  id: string;
  cpf: string;           // mascarado para exibição
  cpfFull: string;       // completo (interno)
  attemptType: 'product_limit' | 'affiliate_reuse';
  productId?: string;
  affiliateCode?: string;
  blockedAt: string;
  customerEmail?: string;
  customerName?: string;
  orderNumber?: string;
}

interface CpfEntry {
  cpf: string;
  productIds: string[];
  affiliateCodes: string[];
}

const maskCpf = (cpf: string) => {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(9)}`;
};

const FraudDashboard: React.FC = () => {
  const { toast } = useToast();
  const [attempts, setAttempts] = useState<FraudAttempt[]>([]);
  const [cpfEntries, setCpfEntries] = useState<CpfEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'attempts' | 'index' | 'migration'>('attempts');
  const [searchCpf, setSearchCpf] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    if (!db) { setLoading(false); return; }
    try {
      const [attSnap, idxSnap] = await Promise.all([
        getDocs(collection(db, 'fraud_attempts')),
        getDocs(collection(db, 'cpf_index')),
      ]);
      setAttempts(
        attSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as FraudAttempt))
          .sort((a, b) => b.blockedAt.localeCompare(a.blockedAt))
      );
      setCpfEntries(
        idxSnap.docs.map(d => ({
          cpf: d.id,
          ...(d.data() as { productIds: string[]; affiliateCodes: string[] }),
        }))
      );
    } catch { /* ignora */ }
    setLoading(false);
  };

  const handleDeleteAttempt = async (id: string) => {
    if (!db) return;
    await deleteDoc(doc(db, 'fraud_attempts', id));
    setAttempts(a => a.filter(x => x.id !== id));
    toast({ title: 'Registro removido' });
  };

  const handleDeleteCpfEntry = async (cpf: string) => {
    if (!confirm(`Remover CPF ${maskCpf(cpf)} do índice? Isso permite que ele compre novamente produtos/cupons bloqueados.`)) return;
    if (!db) return;
    await deleteDoc(doc(db, 'cpf_index', cpf));
    setCpfEntries(e => e.filter(x => x.cpf !== cpf));
    toast({ title: 'CPF removido do índice' });
  };

  const filteredEntries = searchCpf
    ? cpfEntries.filter(e => normalizeCPF(searchCpf).length === 11
        ? e.cpf === normalizeCPF(searchCpf)
        : e.cpf.includes(normalizeCPF(searchCpf)))
    : cpfEntries;

  const attemptsProduct = attempts.filter(a => a.attemptType === 'product_limit').length;
  const attemptsAffiliate = attempts.filter(a => a.attemptType === 'affiliate_reuse').length;

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800 p-4">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Tentativas Bloqueadas
          </p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{attempts.length}</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-950/20 rounded-xl border border-orange-200 dark:border-orange-800 p-4">
          <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1">Limite Produto</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{attemptsProduct}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800 p-4">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Reuso Cupom</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{attemptsAffiliate}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> CPFs no Índice
          </p>
          <p className="text-2xl font-bold">{cpfEntries.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {([
          { id: 'attempts', label: '🚨 Tentativas' },
          { id: 'index', label: '🔍 Índice CPF' },
          { id: 'migration', label: '⚙️ Migração' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
            {t.id === 'attempts' && attempts.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{attempts.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : tab === 'attempts' ? (
        <div>
          {attempts.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <ShieldCheck className="w-10 h-10 mx-auto text-green-500 mb-3" />
              <p className="font-semibold">Nenhuma tentativa de fraude registrada</p>
              <p className="text-sm text-muted-foreground mt-1">O sistema está bloqueando automaticamente. Os registros aparecerão aqui.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attempts.map(a => (
                <div key={a.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${a.attemptType === 'product_limit' ? 'bg-red-100 dark:bg-red-950/40' : 'bg-amber-100 dark:bg-amber-950/40'}`}>
                      <AlertTriangle className={`w-4 h-4 ${a.attemptType === 'product_limit' ? 'text-red-500' : 'text-amber-500'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a.attemptType === 'product_limit' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'}`}>
                          {a.attemptType === 'product_limit' ? 'Limite de produto' : 'Reuso de cupom'}
                        </span>
                        <span className="font-mono text-sm font-semibold">{maskCpf(a.cpfFull || a.cpf || '')}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(a.blockedAt).toLocaleString('pt-BR')}
                        {a.customerEmail && ` · ${a.customerEmail}`}
                        {a.customerName && ` · ${a.customerName}`}
                      </p>
                      {a.affiliateCode && (
                        <p className="text-xs text-muted-foreground">Código: <span className="font-mono">{a.affiliateCode}</span></p>
                      )}
                      {a.productId && (
                        <p className="text-xs text-muted-foreground">Produto: <span className="font-mono text-xs">{a.productId}</span></p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteAttempt(a.id)}
                    className="text-muted-foreground hover:text-red-500 h-8 w-8 p-0 flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'index' ? (
        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <input
              className="px-3 py-2 text-sm rounded-lg border border-border bg-background flex-1 max-w-xs"
              placeholder="Buscar CPF (com ou sem pontuação)..."
              value={searchCpf}
              onChange={e => setSearchCpf(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">{filteredEntries.length} CPFs</p>
          </div>

          {filteredEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum CPF no índice. Execute a migração para popular com pedidos antigos.</p>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">CPF</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Produtos registrados</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Cupons de afiliado usados</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredEntries.map(e => (
                    <tr key={e.cpf} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm font-semibold">{maskCpf(e.cpf)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {e.productIds.length > 0
                          ? <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">{e.productIds.length} produto{e.productIds.length !== 1 ? 's' : ''}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {e.affiliateCodes.length > 0
                          ? <span className="font-mono text-orange-600">{e.affiliateCodes.join(', ')}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteCpfEntry(e.cpf)}
                          className="text-muted-foreground hover:text-red-500 h-7 w-7 p-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <CpfMigration />
      )}
    </div>
  );
};

export default FraudDashboard;
