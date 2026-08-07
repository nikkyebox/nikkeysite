import React, { useState } from 'react';
import { db } from '@/config/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import { normalizeCPF } from '@/utils/validation';

interface MigrationResult {
  total: number;
  processed: number;
  skipped: number;
  cpfsFound: number;
  errors: number;
  log: string[];
}

const CpfMigration: React.FC = () => {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);

  const runMigration = async () => {
    if (!db) { toast({ title: 'Firebase indisponível', variant: 'destructive' }); return; }
    if (!confirm('Isso vai ler TODOS os pedidos e popular o índice de CPF com o histórico. Continuar?')) return;

    setRunning(true);
    setResult(null);

    const log: string[] = [];
    let total = 0, processed = 0, skipped = 0, errors = 0;

    // Mapa: cpf → { productIds, affiliateCodes }
    const index: Record<string, { productIds: Set<string>; affiliateCodes: Set<string> }> = {};

    try {
      const snap = await getDocs(collection(db, 'orders'));
      total = snap.docs.length;
      log.push(`📦 ${total} pedidos encontrados no Firestore`);

      for (const docSnap of snap.docs) {
        const order = docSnap.data();

        // Ignora cancelados
        if (order.status === 'cancelled') { skipped++; continue; }

        const cpfRaw: string = order.cpf || '';
        const cpf = normalizeCPF(cpfRaw);
        if (cpf.length !== 11) { skipped++; continue; }

        if (!index[cpf]) index[cpf] = { productIds: new Set(), affiliateCodes: new Set() };

        // Produtos com limite de estoque
        const orderItems: any[] = order.items || [];
        orderItems.forEach((it: any) => {
          const pid = it.productId || it.id || '';
          if (pid) index[cpf].productIds.add(pid);
        });

        // Afiliado genérico (sem affiliateProductId)
        const affCode: string = order.affiliateCode || '';
        const affProductId: string = order.affiliateProductId || '';
        if (affCode && !affProductId) {
          index[cpf].affiliateCodes.add(affCode.toUpperCase());
        }

        processed++;
      }

      log.push(`✅ ${processed} pedidos processados, ${skipped} ignorados`);
      log.push(`👤 ${Object.keys(index).length} CPFs únicos encontrados`);

      // Grava no Firestore
      let cpfsFound = 0;
      for (const [cpf, data] of Object.entries(index)) {
        try {
          await setDoc(doc(db, 'cpf_index', cpf), {
            productIds: Array.from(data.productIds),
            affiliateCodes: Array.from(data.affiliateCodes),
          }, { merge: true });
          cpfsFound++;
        } catch {
          errors++;
          log.push(`❌ Erro ao gravar CPF ${cpf.slice(0, 3)}***`);
        }
      }

      log.push(`💾 ${cpfsFound} CPFs gravados no índice`);
      if (errors > 0) log.push(`⚠️ ${errors} erros ao gravar`);

      setResult({ total, processed, skipped, cpfsFound, errors, log });
      toast({ title: 'Migração concluída!', description: `${cpfsFound} CPFs indexados.` });
    } catch (e: any) {
      log.push(`❌ Erro fatal: ${e?.message}`);
      setResult({ total, processed, skipped, cpfsFound: 0, errors: errors + 1, log });
      toast({ title: 'Erro na migração', variant: 'destructive' });
    }

    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Migração do Histórico de CPFs</p>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Lê todos os pedidos existentes no Firestore e popula o índice <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">cpf_index</code> com o histórico de compras e cupons de afiliado já utilizados.
              Isso ativa o bloqueio anti-fraude para pedidos feitos <strong>antes</strong> da proteção ser implementada.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
              Operação segura — não altera pedidos, só grava/atualiza o índice. Pode ser rodada várias vezes sem problema (idempotente).
            </p>
          </div>
        </div>
      </div>

      <Button
        onClick={runMigration}
        disabled={running}
        className="bg-primary text-white gap-2"
      >
        <ShieldCheck className="w-4 h-4" />
        {running ? 'Processando pedidos...' : 'Executar Migração de CPFs'}
      </Button>

      {result && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold">Resultado da Migração</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{result.total}</p>
              <p className="text-xs text-muted-foreground">Total pedidos</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{result.processed}</p>
              <p className="text-xs text-muted-foreground">Processados</p>
            </div>
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-primary">{result.cpfsFound}</p>
              <p className="text-xs text-muted-foreground">CPFs indexados</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${result.errors > 0 ? 'bg-red-50 dark:bg-red-950/20' : 'bg-muted/40'}`}>
              <p className={`text-2xl font-bold ${result.errors > 0 ? 'text-red-600' : ''}`}>{result.errors}</p>
              <p className="text-xs text-muted-foreground">Erros</p>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
            {result.log.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CpfMigration;
