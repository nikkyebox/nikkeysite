import React, { useEffect, useState } from 'react';
import { Loader2, Save, Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { psFeeSettingsService, PsFeeSettings as PsFeeSettingsType, DEFAULT_PS_FEE_UNIT_YEN } from '@/services/psFeeSettingsService';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/UserContext';

/** Taxa de Personal Shopper — antes fixa em ¥1.000/item no código, agora editável aqui. */
const PsFeeSettings: React.FC = () => {
  const { toast } = useToast();
  const { permissions } = useUser();
  const [settings, setSettings] = useState<PsFeeSettingsType | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    psFeeSettingsService.get().then(setSettings);
  }, []);

  // Financeiro → só nível 3, mesmo critério do WisePaymentSettings.
  if (!permissions.canFinancial) return null;
  if (!settings) return null;

  const save = async () => {
    setSaving(true);
    try {
      const clean: PsFeeSettingsType = {
        psFeeUnitYen: Math.max(0, Math.round(Number(settings.psFeeUnitYen) || 0)),
      };
      await psFeeSettingsService.save(clean);
      setSettings(clean);
      toast({ title: '✅ Taxa Personal Shopper salva', description: `Agora ¥${clean.psFeeUnitYen.toLocaleString()} por item.` });
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Handshake className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Taxa Personal Shopper</p>
            <p className="text-xs text-muted-foreground">
              Valor cobrado por item no checkout (padrão: ¥{DEFAULT_PS_FEE_UNIT_YEN.toLocaleString()}). O desconto automático da negociação é 30% deste valor.
            </p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} size="sm" className="gap-2 shrink-0">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">¥</span>
        <input
          type="number"
          min={0}
          step={1}
          value={settings.psFeeUnitYen}
          onChange={(e) => setSettings({ psFeeUnitYen: Number(e.target.value) })}
          className="w-40 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
        />
        <span className="text-sm text-muted-foreground">por item</span>
      </div>
    </div>
  );
};

export default PsFeeSettings;
