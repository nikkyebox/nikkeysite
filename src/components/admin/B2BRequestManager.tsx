import React, { useEffect, useState } from 'react';
import { Building2, Loader2, Trash2, Phone, Check, RotateCcw, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { b2bRequestService, B2BRequest } from '@/services/b2bRequestService';
import { useToast } from '@/hooks/use-toast';
import { requireAdminPassword } from '@/utils/adminGuard';

const STATUS_LABEL: Record<B2BRequest['status'], string> = {
  new: '🆕 Novo', negotiating: '🤝 Negociando', closed: '✅ Fechado',
};
const STATUS_COLOR: Record<B2BRequest['status'], string> = {
  new: 'bg-yellow-100 text-yellow-800',
  negotiating: 'bg-blue-100 text-blue-800',
  closed: 'bg-green-100 text-green-800',
};
const SHIPPING_LABEL: Record<string, string> = {
  container: 'Container (marítimo)', aereo: 'Aéreo expresso', maritimo: 'Marítimo', combinar: 'A combinar',
};

const B2BRequestManager: React.FC = () => {
  const { toast } = useToast();
  const [list, setList] = useState<B2BRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); setList(await b2bRequestService.getAll()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: B2BRequest['status']) => { await b2bRequestService.updateStatus(id, status); load(); };
  const remove = async (id: string) => {
    if (!confirm('Excluir esta cotação B2B?')) return;
    if (!(await requireAdminPassword('excluir esta cotação B2B'))) return;
    await b2bRequestService.remove(id);
    toast({ title: 'Cotação excluída' });
    load();
  };
  const waLink = (c: string) => { const d = c.replace(/\D/g, ''); return d.length >= 8 ? `https://wa.me/${d}` : null; };

  if (loading) return <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> Cotações B2B (Empresas)
          </h2>
          <p className="text-sm text-muted-foreground">{list.length} solicitação(ões) de atacado / PJ</p>
        </div>
        <Button variant="outline" onClick={load} className="rounded-xl gap-2 h-9"><RotateCcw className="w-4 h-4" /> Atualizar</Button>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Nenhuma cotação B2B ainda.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((r) => {
            const wa = waLink(r.contact);
            return (
              <div key={r.id} className="bg-card rounded-2xl border border-border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-foreground">{r.razaoSocial} <span className="text-xs text-muted-foreground font-normal">• {r.country}</span></p>
                    <p className="text-xs text-muted-foreground font-mono">CNPJ: {r.cnpj}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Phone className="w-3.5 h-3.5" /> {r.responsavel} — {r.contact}
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline ml-1">WhatsApp ↗</a>}
                    </p>
                    {r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}
                    <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(r.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </div>

                <div className="bg-secondary/30 rounded-xl p-3 text-sm space-y-1.5">
                  <p className="text-foreground whitespace-pre-wrap">{r.productDesc}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                    <span>Volume: <strong>{r.estimatedQty}</strong></span>
                    <span className="flex items-center gap-1"><Ship className="w-3 h-3" /> {SHIPPING_LABEL[r.shipping] || r.shipping}</span>
                  </div>
                  {r.notes && <p className="text-xs text-muted-foreground italic border-t border-border pt-1.5">Obs: {r.notes}</p>}
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
                  {r.status !== 'negotiating' && (
                    <Button onClick={() => setStatus(r.id, 'negotiating')} variant="outline" size="sm" className="gap-1.5">🤝 Em negociação</Button>
                  )}
                  {r.status !== 'closed' && (
                    <Button onClick={() => setStatus(r.id, 'closed')} variant="outline" size="sm" className="gap-1.5 text-green-600"><Check className="w-4 h-4" /> Fechar</Button>
                  )}
                  {r.status !== 'new' && (
                    <Button onClick={() => setStatus(r.id, 'new')} variant="outline" size="sm">Reabrir</Button>
                  )}
                  <Button onClick={() => remove(r.id)} variant="outline" size="sm" className="gap-1.5 text-red-600 ml-auto"><Trash2 className="w-4 h-4" /> Excluir</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default B2BRequestManager;
