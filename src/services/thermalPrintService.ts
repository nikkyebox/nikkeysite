/**
 * thermalPrintService
 *
 * Envia o pedido ao servidor de impressão local (thermal-print-server)
 * para impressão silenciosa em impressora térmica de rede.
 *
 * O endereço e token são configurados no painel admin em
 * Configurações → Impressora e salvos no localStorage.
 */

const STORAGE_KEY = 'thermalPrinter';

export interface ThermalPrinterConfig {
  enabled: boolean;
  serverUrl: string;   // ex: "http://192.168.1.50:3210"
  authToken: string;
}

const DEFAULT_CONFIG: ThermalPrinterConfig = {
  enabled: false,
  serverUrl: 'http://localhost:3210',
  authToken: 'japan-express-print-token-2024',
};

export const thermalPrintService = {
  getConfig(): ThermalPrinterConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_CONFIG;
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_CONFIG;
    }
  },

  saveConfig(config: ThermalPrinterConfig): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  },

  async checkOnline(): Promise<boolean> {
    const cfg = this.getConfig();
    if (!cfg.enabled) return false;
    try {
      const res = await fetch(`${cfg.serverUrl}/health`, {
        headers: { 'x-print-token': cfg.authToken },
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async printOrder(order: any): Promise<{ ok: boolean; error?: string }> {
    const cfg = this.getConfig();
    if (!cfg.enabled) return { ok: false, error: 'Impressora não ativada' };

    try {
      const res = await fetch(`${cfg.serverUrl}/print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-print-token': cfg.authToken,
        },
        body: JSON.stringify(order),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: (body as { error?: string }).error || `HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  },
};
