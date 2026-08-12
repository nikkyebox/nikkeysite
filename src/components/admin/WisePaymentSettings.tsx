import React, { useEffect, useState } from 'react';
import { Loader2, Save, Wallet, Landmark, Phone, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { paymentSettingsService, PaymentSettings } from '@/services/paymentSettingsService';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/UserContext';

const WisePaymentSettings: React.FC = () => {
  const { toast } = useToast();
  const { permissions } = useUser();
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    paymentSettingsService.get().then(setSettings);
  }, []);

  // Configuração de pagamento é financeiro → só nível 3
  if (!permissions.canFinancial) return null;
  if (!settings) return null;

  const save = async () => {
    setSaving(true);
    try {
      const clean: PaymentSettings = {
        wiseLink: settings.wiseLink.trim(),
        wiseEnabled: settings.wiseEnabled && !!settings.wiseLink.trim(),
        pixKey: settings.pixKey.trim(),
        pixReceiverName: settings.pixReceiverName.trim() || 'NikkeyBox',
        pixCity: settings.pixCity.trim() || 'Sao Paulo',
        pixEnabled: settings.pixEnabled,
        cardEnabled: settings.cardEnabled,
        yuchoKigo: settings.yuchoKigo.trim(),
        yuchoNumber: settings.yuchoNumber.trim(),
        yuchoName: settings.yuchoName.trim(),
        contactPhone: settings.contactPhone.trim(),
      };
      await paymentSettingsService.save(clean);
      setSettings(clean);
      toast({ title: '✅ Pagamento salvo', description: clean.pixKey ? 'Chave PIX configurada — o QR Code do checkout usa ela.' : 'Configurações salvas.' });
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Pagamento Wise</p>
            <p className="text-xs text-muted-foreground">Cole seu link de cobrança Wise ou Wisetag — aparece no checkout internacional.</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} size="sm" className="gap-2 shrink-0">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </Button>
      </div>

      <input
        value={settings.wiseLink}
        onChange={(e) => setSettings({ ...settings, wiseLink: e.target.value })}
        placeholder="https://wise.com/pay/me/seunome  ou  @seuwisetag"
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mb-2"
      />
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={settings.wiseEnabled}
          onChange={(e) => setSettings({ ...settings, wiseEnabled: e.target.checked })}
          className="w-4 h-4 rounded border-input text-primary"
        />
        Mostrar a opção <strong>Wise</strong> no checkout (precisa do link preenchido)
      </label>

      {/* Seção PIX */}
      <div className="mt-5 pt-5 border-t border-border space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Chave PIX (Brasil)</p>
            <p className="text-xs text-muted-foreground">A chave abaixo gera o QR Code / Copia e Cola que o cliente paga.</p>
          </div>
        </div>
        <input
          value={settings.pixKey}
          onChange={(e) => setSettings({ ...settings, pixKey: e.target.value })}
          placeholder="Chave PIX (e-mail, CPF, telefone ou aleatória)"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={settings.pixReceiverName}
            onChange={(e) => setSettings({ ...settings, pixReceiverName: e.target.value })}
            placeholder="Nome do recebedor (máx 25)"
            maxLength={25}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
          <input
            value={settings.pixCity}
            onChange={(e) => setSettings({ ...settings, pixCity: e.target.value })}
            placeholder="Cidade (máx 15)"
            maxLength={15}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          O nome e a cidade devem ser os mesmos cadastrados na sua conta do banco/PIX.
        </p>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={settings.pixEnabled}
            onChange={(e) => setSettings({ ...settings, pixEnabled: e.target.checked })}
            className="w-4 h-4 rounded border-input text-primary"
          />
          Mostrar a opção <strong>PIX</strong> no checkout (senão aparece "Em manutenção")
        </label>
      </div>

      {/* Seção Cartão de Crédito (Stripe) */}
      <div className="mt-5 pt-5 border-t border-border space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Cartão de Crédito (Stripe)</p>
            <p className="text-xs text-muted-foreground">Requer as chaves do Stripe configuradas no servidor (STRIPE_SECRET_KEY / VITE_STRIPE_PUBLISHABLE_KEY).</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.cardEnabled}
            onChange={(e) => setSettings({ ...settings, cardEnabled: e.target.checked })}
            className="w-4 h-4 rounded border-input text-primary"
          />
          Mostrar a opção <strong>Cartão</strong> no checkout (senão aparece "Em manutenção")
        </label>
      </div>

      {/* Seção Japão — Yucho Bank e Telefone */}
      <div className="mt-5 pt-5 border-t border-border space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
            <Landmark className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">ゆうちょ銀行 — Yucho Bank (Japão)</p>
            <p className="text-xs text-muted-foreground">Dados exibidos no checkout para clientes no Japão.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground font-medium block mb-1">記号 (Kigo)</label>
            <input
              value={settings.yuchoKigo}
              onChange={(e) => setSettings({ ...settings, yuchoKigo: e.target.value })}
              placeholder="Ex: 12260"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground font-medium block mb-1">番号 (Bangou)</label>
            <input
              value={settings.yuchoNumber}
              onChange={(e) => setSettings({ ...settings, yuchoNumber: e.target.value })}
              placeholder="Ex: 33664351"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground font-medium block mb-1">口座名義 (Nome do titular)</label>
          <input
            value={settings.yuchoName}
            onChange={(e) => setSettings({ ...settings, yuchoName: e.target.value })}
            placeholder="Ex: ロドリゲス シオカワ"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
          />
        </div>

        {/* Telefone de contato — WhatsApp e PayPay */}
        <div className="pt-3 border-t border-dashed border-border">
          <div className="flex items-center gap-2 mb-2">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <p className="font-semibold text-foreground text-sm">Telefone de Contato (WhatsApp / PayPay)</p>
          </div>
          <input
            value={settings.contactPhone}
            onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
            placeholder="Ex: 00000-0000"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Formato doméstico japonês. Aparece nos modais de PayPay e Yucho, e no link do WhatsApp para envio de comprovante.
          </p>
        </div>
      </div>
    </div>
  );
};

export default WisePaymentSettings;
