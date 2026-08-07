import React, { useState, useEffect } from 'react';
import { MessageCircle, Wifi, WifiOff, Save, QrCode, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { waServer, type WaServerConfig } from '@/services/waServerService';
import { useToast } from '@/hooks/use-toast';

export default function WhatsAppSettings() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<WaServerConfig>(waServer.getConfig());
  const [status, setStatus] = useState<{ online: boolean; ready: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cfg.enabled) check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check() {
    setChecking(true);
    setStatus(null);
    const s = await waServer.checkStatus();
    setStatus(s);
    setChecking(false);
  }

  function save() {
    waServer.saveConfig(cfg);
    toast({ title: '✅ Configuração salva', description: 'WhatsApp configurado.' });
    if (cfg.enabled) check();
  }

  async function sendTest() {
    if (!testPhone.trim()) {
      toast({ title: 'Informe um número', description: 'Digite um telefone para o teste.', variant: 'destructive' });
      return;
    }
    setSending(true);
    const result = await waServer.sendMessage(
      testPhone.trim(),
      '🧪 Mensagem de teste do NikkeyBox! Se você recebeu isto, o WhatsApp está configurado corretamente. ✅'
    );
    setSending(false);
    if (result.ok) {
      toast({ title: '📱 Enviado!', description: 'Mensagem de teste enviada.' });
    } else {
      toast({ title: 'Erro ao enviar', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <MessageCircle className="w-5 h-5 text-green-600" />
        <h2 className="text-lg font-bold">WhatsApp Automático</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Envia mensagens automáticas ao cliente quando o pedido muda de status:
        pagamento confirmado, preparando o pacote e enviado (com rastreio).
      </p>

      {/* Ativar/desativar */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
          className={`relative w-11 h-6 rounded-full transition-colors ${cfg.enabled ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.enabled ? 'translate-x-5' : ''}`} />
        </div>
        <span className="font-medium">{cfg.enabled ? 'Notificações WhatsApp ativas' : 'Notificações WhatsApp desativadas'}</span>
      </label>

      {/* Campos */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold block mb-1">URL do servidor de WhatsApp</label>
          <input
            type="text"
            value={cfg.serverUrl}
            onChange={e => setCfg(c => ({ ...c, serverUrl: e.target.value.trim() }))}
            placeholder="http://localhost:3220"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Endereço do PC onde o <code>whatsapp-server</code> está rodando.
          </p>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Token de autenticação</label>
          <input
            type="text"
            value={cfg.authToken}
            onChange={e => setCfg(c => ({ ...c, authToken: e.target.value.trim() }))}
            placeholder="japan-express-whatsapp-token-2024"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Igual ao <code>authToken</code> do <code>config.js</code> do servidor.
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 bg-secondary/40 rounded-lg px-4 py-3 flex-wrap">
        {checking ? (
          <span className="text-sm text-muted-foreground animate-pulse">Verificando…</span>
        ) : status?.online && status?.ready ? (
          <>
            <Wifi className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-700 dark:text-green-400 font-medium">Conectado e pronto para enviar ✅</span>
          </>
        ) : status?.online && !status?.ready ? (
          <>
            <QrCode className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
              Servidor online, mas WhatsApp não pareado — escaneie o QR
            </span>
          </>
        ) : status?.online === false ? (
          <>
            <WifiOff className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">Servidor não encontrado — verifique se está rodando</span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Status desconhecido</span>
        )}
      </div>

      {/* Link do QR */}
      {status?.online && !status?.ready && (
        <a
          href={`${cfg.serverUrl}/qr`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
        >
          <QrCode className="w-4 h-4" />
          Abrir QR code para parear
        </a>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={save} className="gap-2">
          <Save className="w-4 h-4" /> Salvar configuração
        </Button>
        <Button variant="outline" onClick={check} disabled={checking} className="gap-2">
          <Wifi className="w-4 h-4" /> Testar conexão
        </Button>
      </div>

      {/* Teste de envio */}
      <div className="space-y-2 border-t border-border pt-4">
        <label className="text-sm font-semibold block">Enviar mensagem de teste</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="5511999999999 (com DDI)"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
          />
          <Button onClick={sendTest} disabled={sending || !cfg.enabled} className="gap-2 shrink-0">
            <Send className="w-4 h-4" /> {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        </div>
      </div>

      {/* Instruções */}
      <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4 text-sm space-y-2">
        <p className="font-semibold">Como configurar o servidor:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Copie a pasta <code>whatsapp-server</code> do projeto para o PC do operador</li>
          <li>Execute <code>npm install</code> e depois <code>npm start</code></li>
          <li>Escaneie o QR code <strong>uma vez</strong> com o WhatsApp da loja (a sessão fica salva)</li>
          <li>Configure a URL e o token aqui acima e clique em Salvar</li>
        </ol>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
          ⚠️ Use um número dedicado da loja. Envie só mensagens de status do pedido para evitar bloqueio.
        </p>
      </div>
    </div>
  );
}
