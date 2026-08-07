import React, { useState, useEffect } from 'react';
import { Handshake, CheckCircle2, XCircle, Hourglass, ChevronDown, ChevronUp, Package, User, Truck, Clock, Trash2, AlertTriangle } from 'lucide-react';
import { negotiationService } from '@/services/negotiationService';
import { Negotiation, NegotiationStatus } from '@/types/negotiation';
import { formatPrice } from '@/utils/currency';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/UserContext';

const STATUS_LABELS: Record<NegotiationStatus, string> = {
  pending: 'Aguardando',
  auto_approved: 'Auto-aprovado',
  approved: 'Aprovado',
  rejected: 'Recusado',
  expired: 'Expirado',
  used: 'Finalizado',
};

const STATUS_COLORS: Record<NegotiationStatus, string> = {
  pending: 'bg-orange-100 text-orange-700 border-orange-300',
  auto_approved: 'bg-green-100 text-green-700 border-green-300',
  approved: 'bg-green-100 text-green-700 border-green-300',
  rejected: 'bg-red-100 text-red-700 border-red-300',
  expired: 'bg-gray-100 text-gray-500 border-gray-300',
  used: 'bg-blue-100 text-blue-700 border-blue-300',
};

function fmt(yen: number) {
  return `¥${yen.toLocaleString('ja-JP')}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Expirado'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setRemaining(`${h}h ${m}min restantes`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return <span className="text-[10px] text-orange-500 font-semibold flex items-center gap-1"><Clock className="w-3 h-3" />{remaining}</span>;
}

const NegotiationRow: React.FC<{ neg: Negotiation }> = ({ neg }) => {
  const { user } = useUser();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [approveInput, setApproveInput] = useState(String(neg.requestedDiscountYen));
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const displayCurrency = (neg.currency || 'BRL') as 'BRL' | 'EUR' | 'JPY';

  // Use frozen exchange rate for accurate display — rate is stored at negotiation creation time
  const frozenConvert = (yen: number) => {
    if (displayCurrency === 'JPY') return Math.round(yen);
    return Math.round(yen * neg.exchangeRateAtCreation);
  };

  const isPending = neg.status === 'pending' && !negotiationService.isExpired(neg);
  const isExpiredNow = neg.status === 'expired' || negotiationService.isExpired(neg);
  const isResolved = neg.status === 'approved' || neg.status === 'auto_approved' || neg.status === 'rejected';

  // Auto-expire in admin view if past 24h
  useEffect(() => {
    if (neg.status === 'pending' && negotiationService.isExpired(neg)) {
      negotiationService.expire(neg.id).catch(() => {});
    }
  }, [neg.id, neg.status, neg.expiresAt]);

  const adminEmail = user?.email || 'admin';

  const handleApprove = async (overrideDiscount?: number) => {
    const discount = overrideDiscount ?? (parseInt(approveInput, 10) || 0);
    if (discount <= 0) { toast({ title: 'Informe o desconto a aprovar', variant: 'destructive' }); return; }
    // Frete não pode zerar (mín. 1¥); taxa PS PODE ser zerada (desconto = valor total).
    const maxDiscount = neg.type === 'ps_fee' ? neg.originalAmountYen : neg.originalAmountYen - 1;
    if (discount > maxDiscount) {
      toast({ title: neg.type === 'ps_fee' ? 'Desconto não pode passar do valor da taxa' : 'Desconto não pode zerar o frete', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await negotiationService.approve(neg.id, discount, adminNote, adminEmail);
      const isZero = discount >= neg.originalAmountYen;
      toast({ title: isZero ? '✅ Taxa PS zerada!' : '✅ Negociação aprovada!', description: `Desconto de ${fmt(discount)} aplicado.` });
    } catch {
      toast({ title: 'Erro ao aprovar', variant: 'destructive' });
    }
    setSaving(false);
  };

  // Zera completamente a taxa de PS (desconto = valor total)
  const handleZeroPsFee = () => handleApprove(neg.originalAmountYen);

  const handleReject = async () => {
    if (!adminNote.trim()) {
      toast({ title: 'Informe o motivo da recusa para o cliente', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await negotiationService.reject(neg.id, adminNote, adminEmail);
      toast({ title: '❌ Negociação recusada.' });
    } catch {
      toast({ title: 'Erro ao recusar', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Deletar esta negociação de ${neg.userName}?\nEla sumirá do perfil do cliente.`)) return;
    setDeleting(true);
    try {
      await negotiationService.deleteNegotiation(neg.id);
      toast({ title: '🗑️ Negociação deletada' });
    } catch {
      toast({ title: 'Erro ao deletar', variant: 'destructive' });
      setDeleting(false);
    }
  };

  return (
    <div className={`rounded-2xl border overflow-hidden ${isPending ? 'border-orange-300 bg-orange-50/30 dark:bg-orange-950/10' : isExpiredNow ? 'border-gray-200 opacity-60' : 'border-border bg-card'}`}>
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${STATUS_COLORS[isExpiredNow ? 'expired' : neg.status]}`}>
              {isPending && <Hourglass className="w-3 h-3" />}
              {(neg.status === 'approved' || neg.status === 'auto_approved') && <CheckCircle2 className="w-3 h-3" />}
              {(neg.status === 'rejected' || isExpiredNow) && <XCircle className="w-3 h-3" />}
              {STATUS_LABELS[isExpiredNow ? 'expired' : neg.status]}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {neg.type === 'ps_fee' ? '🤝 Taxa PS' : '🚚 Frete'}
            </span>
            <span className="text-xs text-muted-foreground">
              de {fmt(neg.originalAmountYen)} → pediu {fmt(neg.requestedDiscountYen)} off
            </span>
            {isPending && neg.expiresAt && <ExpiryCountdown expiresAt={neg.expiresAt} />}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><User className="w-3 h-3" />{neg.userName} ({neg.userEmail})</span>
            <span>{fmtDate(neg.createdAt)}</span>
            <span>{neg.cartItems.length} produto(s) · {neg.numUnits} un.</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Deletar negociação"
          className="shrink-0 p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-border/60 space-y-5">

          {/* Cart items */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 mt-4 flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> Snapshot do Carrinho
            </h4>
            <div className="space-y-2">
              {neg.cartItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-secondary/30">
                  <img src={item.productImage} alt={item.productName} className="w-10 h-10 rounded-lg object-cover border border-border" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">{item.variantLabel || item.size} · {item.quantity}x · {fmt(item.priceYen)}/un</p>
                  </div>
                  <span className="text-sm font-bold">{fmt(item.priceYen * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping */}
          {neg.shipping && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/30 rounded-xl px-4 py-2">
              <Truck className="w-4 h-4" />
              <span>{neg.shipping.carrier} · {neg.shipping.estimatedDays} dias · {fmt(neg.shipping.costYen)}</span>
            </div>
          )}

          {/* Exchange rate frozen */}
          <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-800 rounded-xl px-3 py-2">
            Taxa de câmbio congelada: ¥1 = {displayCurrency === 'JPY' ? '¥1' : `${neg.currency} ${neg.exchangeRateAtCreation?.toFixed(6)}`}
            {neg.type === 'ps_fee' && ` — ¥${neg.requestedDiscountYen.toLocaleString()} de desconto ≈ ${formatPrice(frozenConvert(neg.requestedDiscountYen), displayCurrency)}`}
          </div>

          {/* Client note */}
          {neg.clientNote && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2.5 text-sm text-blue-800 dark:text-blue-200">
              <span className="font-semibold">Mensagem do cliente: </span>{neg.clientNote}
            </div>
          )}

          {/* Negotiation values */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-card border border-border rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">Valor original</p>
              <p className="font-bold">{fmt(neg.originalAmountYen)}</p>
              <p className="text-xs text-muted-foreground">{formatPrice(frozenConvert(neg.originalAmountYen), displayCurrency)}</p>
            </div>
            <div className="bg-card border border-orange-200 dark:border-orange-700 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">Pedido pelo cliente</p>
              <p className="font-bold text-orange-600">{fmt(neg.requestedDiscountYen)}</p>
              {neg.type === 'ps_fee' && (
                <p className="text-xs text-muted-foreground">
                  Máx. auto: {fmt(300 * neg.numUnits)}
                </p>
              )}
            </div>
            {isResolved && neg.approvedDiscountYen != null && (
              <div className="bg-card border border-green-200 dark:border-green-700 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Desconto aprovado</p>
                <p className="font-bold text-green-600">{fmt(neg.approvedDiscountYen)}</p>
                <p className="text-xs text-muted-foreground">
                  Final: {fmt(neg.originalAmountYen - neg.approvedDiscountYen)}
                </p>
              </div>
            )}
            {isResolved && neg.status === 'rejected' && (
              <div className="bg-card border border-red-200 dark:border-red-700 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Resultado</p>
                <p className="font-bold text-red-600">Recusado</p>
              </div>
            )}
          </div>

          {/* Audit trail */}
          {(isResolved || isExpiredNow) && (
            <div className="text-xs text-muted-foreground bg-secondary/40 rounded-xl px-4 py-2.5 space-y-0.5">
              <p className="font-semibold text-foreground mb-1">Auditoria</p>
              {neg.approvedBy && <p>Resolvido por: <span className="font-mono">{neg.approvedBy}</span></p>}
              {neg.approvedAt && <p>Data: {fmtDate(neg.approvedAt)}</p>}
              {neg.adminNote && <p>Nota: {neg.adminNote}</p>}
            </div>
          )}

          {/* Admin action panel */}
          {isPending && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <h4 className="text-sm font-bold text-foreground">Responder Proposta</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Desconto a aprovar (¥) <span className="text-orange-500">— cliente pediu: {fmt(neg.requestedDiscountYen)}</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={approveInput}
                    onChange={e => setApproveInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                  {parseInt(approveInput) !== neg.requestedDiscountYen && parseInt(approveInput) > 0 && (
                    <p className="text-[10px] text-orange-500 mt-0.5">
                      Diferente do pedido — cliente verá ~~{fmt(neg.requestedDiscountYen)}~~ → {fmt(parseInt(approveInput))}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Nota para o cliente <span className="text-red-500">(obrigatória se recusar)</span>
                  </label>
                  <input
                    type="text"
                    value={adminNote}
                    onChange={e => setAdminNote(e.target.value)}
                    placeholder="Ex: Aprovado como cortesia!"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => handleApprove()} disabled={saving} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  {saving ? 'Salvando...' : 'Aprovar'}
                </Button>
                <Button onClick={handleReject} disabled={saving} variant="outline" className="flex-1 border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Recusar
                </Button>
              </div>
              {neg.type === 'ps_fee' && (
                <Button onClick={handleZeroPsFee} disabled={saving} variant="outline" className="w-full border-purple-400 text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950 mt-1">
                  💸 Zerar Taxa PS completamente ({fmt(neg.originalAmountYen)} → ¥0)
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const NegotiationManager: React.FC = () => {
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending');
  const [deletingAll, setDeletingAll] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    return negotiationService.listenAll(setNegotiations);
  }, []);

  const handleDeleteAll = async () => {
    if (!confirm(`⚠️ Apagar TODAS as ${negotiations.length} negociações?\n\nElas sumirão do perfil de todos os clientes.`)) return;
    setDeletingAll(true);
    try {
      await negotiationService.deleteAllNegotiations();
      toast({ title: `🗑️ ${negotiations.length} negociações deletadas` });
    } catch {
      toast({ title: 'Erro ao deletar', variant: 'destructive' });
    }
    setDeletingAll(false);
  };

  // Runtime expiry check: treat Firestore-pending-but-past-24h as expired for display
  const withRuntimeStatus = (neg: Negotiation) =>
    neg.status === 'pending' && negotiationService.isExpired(neg)
      ? { ...neg, status: 'expired' as const }
      : neg;

  const enriched = negotiations.map(withRuntimeStatus);
  const pending = enriched.filter(n => n.status === 'pending');
  const resolved = enriched.filter(n => n.status !== 'pending');
  const shown = filter === 'all' ? enriched : filter === 'pending' ? pending : resolved;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-orange-500">{pending.length}</p>
          <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">Aguardando</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-green-600">{enriched.filter(n => n.status === 'approved' || n.status === 'auto_approved').length}</p>
          <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">Aprovadas</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-blue-600">{enriched.filter(n => n.status === 'used').length}</p>
          <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">Finalizadas</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-red-500">{enriched.filter(n => n.status === 'rejected').length}</p>
          <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">Recusadas</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-gray-400">{enriched.filter(n => n.status === 'expired').length}</p>
          <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">Expiradas</p>
        </div>
      </div>

      {/* Bulk delete */}
      {enriched.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 gap-1.5"
            onClick={handleDeleteAll}
            disabled={deletingAll}
          >
            <Trash2 className="w-4 h-4" />
            {deletingAll ? 'Apagando...' : `Apagar todas (${enriched.length})`}
          </Button>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(['pending', 'all', 'resolved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/50'}`}
          >
            {f === 'pending' ? `Aguardando (${pending.length})` : f === 'all' ? `Todas (${enriched.length})` : `Resolvidas (${resolved.length})`}
          </button>
        ))}
      </div>

      {/* List */}
      {shown.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Handshake className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Nenhuma negociação {filter === 'pending' ? 'pendente' : filter === 'resolved' ? 'resolvida' : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(neg => <NegotiationRow key={neg.id} neg={neg} />)}
        </div>
      )}
    </div>
  );
};

export default NegotiationManager;
