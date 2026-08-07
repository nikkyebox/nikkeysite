import React, { useEffect, useState } from 'react';
import { PackagePlus, Loader2, Trash2, ExternalLink, Phone, Check, RotateCcw, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { customRequestService, CustomRequest } from '@/services/customRequestService';
import { useToast } from '@/hooks/use-toast';
import { requireAdminPassword } from '@/utils/adminGuard';
import { useUser } from '@/context/UserContext';
import RegisterSaleModal from '@/components/admin/RegisterSaleModal';

const STATUS_LABEL: Record<CustomRequest['status'], string> = {
  new: '🆕 Novo', quoted: '💬 Cotado', closed: '✅ Fechado',
};
const STATUS_COLOR: Record<CustomRequest['status'], string> = {
  new: 'bg-yellow-100 text-yellow-800',
  quoted: 'bg-blue-100 text-blue-800',
  closed: 'bg-green-100 text-green-800',
};

const CustomRequestManager: React.FC = () => {
  const { toast } = useToast();
  const { user } = useUser();
  const [list, setList] = useState<CustomRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saleRequest, setSaleRequest] = useState<CustomRequest | null>(null);
  const [avulsaOpen, setAvulsaOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setList(await customRequestService.getAll());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: CustomRequest['status']) => {
    await customRequestService.updateStatus(id, status);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm('Excluir este pedido personalizado?')) return;
    if (!(await requireAdminPassword('excluir este pedido personalizado'))) return;
    await customRequestService.remove(id);
    toast({ title: 'Pedido excluído' });
    load();
  };

  const waLink = (contact: string) => {
    const digits = contact.replace(/\D/g, '');
    return digits.length >= 8 ? `https://wa.me/${digits}` : null;
  };

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <PackagePlus className="w-6 h-6 text-primary" /> Pedidos Personalizados
          </h2>
          <p className="text-sm text-muted-foreground">{list.length} pedido(s) de "Faça seu Pedido"</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAvulsaOpen(true)} className="rounded-xl gap-2 h-9 bg-green-600 hover:bg-green-700 text-white">
            <DollarSign className="w-4 h-4" /> Registrar Venda
          </Button>
          <Button variant="outline" onClick={load} className="rounded-xl gap-2 h-9">
            <RotateCcw className="w-4 h-4" /> Atualizar
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <PackagePlus className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Nenhum pedido personalizado ainda.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((r) => {
            const wa = waLink(r.contact);
            return (
              <div key={r.id} className={`bg-card rounded-2xl border p-5 ${r.status === 'new' ? 'border-yellow-400 border-2' : 'border-border'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-foreground">{r.name} <span className="text-xs text-muted-foreground font-normal">• {r.country}</span></p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" /> {r.contact}
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline ml-1">WhatsApp ↗</a>}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(r.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </div>

                <div className="bg-secondary/30 rounded-xl p-3 text-sm">
                  <p className="text-foreground whitespace-pre-wrap">{r.productDesc}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    <span>Qtd: <strong>{r.quantity || '1'}</strong></span>
                    {r.referenceLink && (
                      <a href={r.referenceLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> Link de referência
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
                  <Button onClick={() => setSaleRequest(r)} size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                    <DollarSign className="w-4 h-4" /> Registrar Venda
                  </Button>
                  {r.status !== 'quoted' && (
                    <Button onClick={() => setStatus(r.id, 'quoted')} variant="outline" size="sm" className="gap-1.5">
                      💬 Marcar como cotado
                    </Button>
                  )}
                  {r.status !== 'closed' && (
                    <Button onClick={() => setStatus(r.id, 'closed')} variant="outline" size="sm" className="gap-1.5 text-green-600">
                      <Check className="w-4 h-4" /> Fechar
                    </Button>
                  )}
                  {r.status !== 'new' && (
                    <Button onClick={() => setStatus(r.id, 'new')} variant="outline" size="sm" className="gap-1.5">
                      Reabrir
                    </Button>
                  )}
                  <Button onClick={() => remove(r.id)} variant="outline" size="sm" className="gap-1.5 text-red-600 ml-auto">
                    <Trash2 className="w-4 h-4" /> Excluir
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {saleRequest && (
        <RegisterSaleModal
          request={saleRequest}
          adminName={user?.name}
          onClose={() => setSaleRequest(null)}
          onRegistered={load}
        />
      )}

      {avulsaOpen && (
        <RegisterSaleModal
          adminName={user?.name}
          onClose={() => setAvulsaOpen(false)}
          onRegistered={load}
        />
      )}
    </div>
  );
};

export default CustomRequestManager;
