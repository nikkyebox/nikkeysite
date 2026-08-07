import React, { useState } from 'react';
import { Wrench, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import { useToast } from '@/hooks/use-toast';

const MaintenanceToggle: React.FC = () => {
  const { isEnabled, loading, toggle } = useMaintenanceMode();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleToggle = async () => {
    setBusy(true);
    const { ok, newState, error } = await toggle();
    setBusy(false);

    if (!ok) {
      toast({
        title: '❌ Falha ao alterar modo manutenção',
        description: error || 'Erro desconhecido',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: newState ? '🔧 Modo manutenção ATIVADO' : '✅ Site ONLINE novamente',
      description: newState
        ? 'O público vê a página de manutenção. Você (admin) continua com acesso normal.'
        : 'A loja voltou ao ar para todos.',
    });
  };

  return (
    <div
      className={`rounded-xl border p-5 flex items-center justify-between gap-4 ${
        isEnabled
          ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
          : 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isEnabled ? 'bg-amber-100' : 'bg-green-100'
          }`}
        >
          <Wrench className={`w-5 h-5 ${isEnabled ? 'text-amber-700' : 'text-green-700'}`} />
        </div>
        <div>
          <p className={`font-semibold ${isEnabled ? 'text-amber-900 dark:text-amber-300' : 'text-green-900 dark:text-green-300'}`}>
            Modo Manutenção
          </p>
          <p className={`text-xs ${isEnabled ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
            {isEnabled ? '🔴 ATIVADO — site em manutenção para o público' : '🟢 DESATIVADO — loja online'}
          </p>
        </div>
      </div>
      <Button
        onClick={handleToggle}
        disabled={loading || busy}
        variant={isEnabled ? 'destructive' : 'outline'}
        size="sm"
        className="gap-2 shrink-0"
      >
        <Power className="w-4 h-4" />
        {busy ? '...' : isEnabled ? 'Desativar' : 'Ativar'}
      </Button>
    </div>
  );
};

export default MaintenanceToggle;
