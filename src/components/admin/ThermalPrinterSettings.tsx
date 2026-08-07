import React, { useState, useEffect } from 'react';
import { Printer, Wifi, WifiOff, Save, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { thermalPrintService, type ThermalPrinterConfig } from '@/services/thermalPrintService';
import { useToast } from '@/hooks/use-toast';

export default function ThermalPrinterSettings() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<ThermalPrinterConfig>(thermalPrintService.getConfig());
  const [online, setOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (cfg.enabled) checkOnline();
  }, []);

  async function checkOnline() {
    setChecking(true);
    setOnline(null);
    const ok = await thermalPrintService.checkOnline();
    setOnline(ok);
    setChecking(false);
  }

  function save() {
    thermalPrintService.saveConfig(cfg);
    toast({ title: '✅ Configuração salva', description: 'Impressora configurada com sucesso.' });
    if (cfg.enabled) checkOnline();
  }

  async function printTest() {
    setPrinting(true);
    const result = await thermalPrintService.printOrder({
      orderNumber: 'TESTE-001',
      status: 'pending',
      paymentMethod: 'pix',
      orderDate: new Date().toISOString(),
      customerEmail: 'teste@japanexpress.com',
      shippingAddress: {
        name: 'Cliente Teste',
        phone: '(11) 99999-9999',
        postalCode: '01310-100',
        prefecture: 'SP',
        city: 'São Paulo',
        address: 'Av. Paulista, 1000',
      },
      items: [
        { productName: 'Kit Shampoo &honey', size: 'Pequeno', quantity: 1, price: 329 },
      ],
      totalPrice: 403,
      grandTotalYen: 13080,
      shipping: { cost: 74 },
      taxAmount: 213.76,
    });
    setPrinting(false);
    if (result.ok) {
      toast({ title: '🖨️ Impresso!', description: 'Pedido de teste enviado à impressora.' });
    } else {
      toast({ title: 'Erro de impressão', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Printer className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">Impressora Térmica</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Configura o servidor local de impressão. Ao finalizar um pedido, o sistema envia os dados
        automaticamente para a impressora sem abrir diálogos.
      </p>

      {/* Ativar/desativar */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
          className={`relative w-11 h-6 rounded-full transition-colors ${cfg.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.enabled ? 'translate-x-5' : ''}`} />
        </div>
        <span className="font-medium">{cfg.enabled ? 'Impressão automática ativa' : 'Impressão automática desativada'}</span>
      </label>

      {/* Campos */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold block mb-1">
            URL do servidor de impressão
          </label>
          <input
            type="text"
            value={cfg.serverUrl}
            onChange={e => setCfg(c => ({ ...c, serverUrl: e.target.value.trim() }))}
            placeholder="http://192.168.1.50:3210"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            IP do PC onde o servidor de impressão está rodando, na rede local.
          </p>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Token de autenticação</label>
          <input
            type="text"
            value={cfg.authToken}
            onChange={e => setCfg(c => ({ ...c, authToken: e.target.value.trim() }))}
            placeholder="japan-express-print-token-2024"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Deve ser idêntico ao campo <code>authToken</code> no arquivo <code>config.js</code> do servidor.
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 bg-secondary/40 rounded-lg px-4 py-3">
        {checking ? (
          <span className="text-sm text-muted-foreground animate-pulse">Verificando conexão…</span>
        ) : online === true ? (
          <>
            <Wifi className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-700 dark:text-green-400 font-medium">Servidor online e acessível</span>
          </>
        ) : online === false ? (
          <>
            <WifiOff className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">Servidor não encontrado — verifique IP e se o servidor está rodando</span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Status desconhecido</span>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={save} className="gap-2">
          <Save className="w-4 h-4" />
          Salvar configuração
        </Button>
        <Button variant="outline" onClick={checkOnline} disabled={checking} className="gap-2">
          <Wifi className="w-4 h-4" />
          Testar conexão
        </Button>
        <Button variant="outline" onClick={printTest} disabled={printing || !cfg.enabled} className="gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Imprimir pedido de teste
        </Button>
      </div>

      {/* Instruções rápidas */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4 text-sm space-y-2">
        <p className="font-semibold">Como configurar o servidor no PC da impressora:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Copie a pasta <code>thermal-print-server</code> do projeto para o PC</li>
          <li>Execute <code>npm install</code> dentro dela</li>
          <li>Edite <code>config.js</code>: IP da impressora, token e largura do papel</li>
          <li>Para iniciar automaticamente com o Windows: <code>node install-service.js</code> (como Admin)</li>
          <li>Configure o IP desse PC e o token aqui acima e clique em Salvar</li>
        </ol>
      </div>
    </div>
  );
}
