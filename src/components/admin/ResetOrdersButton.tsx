import React, { useState } from 'react';
import { Trash2, Loader2, AlertTriangle, Sparkles, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { orderService } from '@/services/orderService';
import { firebaseSyncService } from '@/services/firebaseSyncService';
import { useToast } from '@/hooks/use-toast';
import { requireAdminPassword } from '@/utils/adminGuard';
import { ensureAdminAuth } from '@/utils/adminAuth';
import { useUser } from '@/context/UserContext';

const ResetOrdersButton: React.FC = () => {
  const { toast } = useToast();
  const { permissions } = useUser();
  const [busyOrders, setBusyOrders] = useState(false);
  const [busyPoints, setBusyPoints] = useState(false);
  const [busyReviews, setBusyReviews] = useState(false);

  if (!permissions.canFinancial) return null;

  const handleResetOrders = async () => {
    const ok = window.confirm(
      'Apagar TODO o histórico de pedidos?\n\n' +
      'Isso remove todos os pedidos do banco (Firestore) e do navegador, ' +
      'inclusive o histórico de "Comprar Novamente" dos clientes.\n\n' +
      'Esta ação NÃO pode ser desfeita.'
    );
    if (!ok) return;
    if (!(await requireAdminPassword('o reset do histórico de pedidos'))) return;

    setBusyOrders(true);
    try {
      const removed = await orderService.clearAllOrders();
      Object.keys(localStorage).filter(k => k.startsWith('promo_bought_')).forEach(k => localStorage.removeItem(k));
      toast({
        title: '🧹 Histórico resetado',
        description: `${removed} pedido(s) removidos do banco + dados locais limpos. Recarregando...`,
      });
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      toast({ title: 'Erro ao resetar', description: e?.message, variant: 'destructive' });
      setBusyOrders(false);
    }
  };

  const handleResetPoints = async () => {
    const ok = window.confirm(
      'Zerar os pontos de fidelidade de TODOS os clientes?\n\nEsta ação NÃO pode ser desfeita.'
    );
    if (!ok) return;
    if (!(await requireAdminPassword('o reset de pontos de todos os clientes'))) return;

    setBusyPoints(true);
    try {
      await ensureAdminAuth();
      const res = await firebaseSyncService.resetAllPoints();
      if (res.success) {
        toast({ title: '✨ Pontos zerados', description: `${res.users} cliente(s) com pontos zerados.` });
      } else {
        toast({ title: 'Erro ao zerar pontos', description: res.error ? String(res.error) : 'Tente novamente.', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Erro ao zerar pontos', description: e?.message, variant: 'destructive' });
    }
    setBusyPoints(false);
  };

  const handleResetReviews = async () => {
    const ok = window.confirm(
      'Apagar TODAS as avaliações de produtos?\n\n' +
      'As estrelas e comentários serão removidos. Clientes e produtos permanecem intactos.\n\n' +
      'Esta ação NÃO pode ser desfeita.'
    );
    if (!ok) return;
    if (!(await requireAdminPassword('apagar todas as avaliações'))) return;

    setBusyReviews(true);
    try {
      firebaseSyncService.clearAllReviews();
      toast({ title: '⭐ Avaliações apagadas', description: 'Todas as avaliações de produtos foram removidas.' });
    } catch (e: any) {
      toast({ title: 'Erro ao apagar avaliações', description: e?.message, variant: 'destructive' });
    }
    setBusyReviews(false);
  };

  return (
    <div className="space-y-3">

      {/* Reset pedidos */}
      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10 p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-red-900 dark:text-red-300">Resetar histórico de pedidos</p>
            <p className="text-xs text-red-700 dark:text-red-400">
              Apaga todos os pedidos (banco + navegador). Use para limpar dados de teste.
            </p>
          </div>
        </div>
        <Button onClick={handleResetOrders} disabled={busyOrders} variant="destructive" size="sm" className="gap-2 shrink-0">
          {busyOrders ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          {busyOrders ? 'Apagando...' : 'Resetar'}
        </Button>
      </div>

      {/* Zerar pontos */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/10 p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-300">Zerar pontos de fidelidade</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Reseta os pontos de todos os clientes para zero no Firestore. Irreversível.
            </p>
          </div>
        </div>
        <Button onClick={handleResetPoints} disabled={busyPoints} variant="outline" size="sm" className="gap-2 shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100">
          {busyPoints ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busyPoints ? 'Zerando...' : 'Zerar Pontos'}
        </Button>
      </div>

      {/* Limpar avaliações */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/10 p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-blue-900 dark:text-blue-300">Limpar avaliações de produtos</p>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Remove todas as estrelas e comentários. Clientes e produtos permanecem intactos.
            </p>
          </div>
        </div>
        <Button onClick={handleResetReviews} disabled={busyReviews} variant="outline" size="sm" className="gap-2 shrink-0 border-blue-400 text-blue-700 hover:bg-blue-100">
          {busyReviews ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
          {busyReviews ? 'Limpando...' : 'Limpar Avaliações'}
        </Button>
      </div>

    </div>
  );
};

export default ResetOrdersButton;
