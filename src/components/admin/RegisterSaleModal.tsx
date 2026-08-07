import React, { useState, useMemo, useRef } from 'react';
import { Plus, X, Loader2, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { orderService } from '@/services/orderService';
import { convertYen } from '@/services/fxService';
import { useToast } from '@/hooks/use-toast';
import type { CustomRequest } from '@/services/customRequestService';

interface ItemRow {
  id: number;
  name: string;
  valueYen: string;
}

interface Props {
  request?: CustomRequest;   // opcional — se ausente, venda avulsa
  adminName?: string;
  onClose: () => void;
  onRegistered: () => void;
}

/**
 * Registra uma VENDA POSTERIOR vinculada a um pedido personalizado.
 * Produtos cobrados fora do site (Wise/PIX direto) que entram como receita
 * quando o admin confirma o recebimento. Lógica de calculadora: + para
 * adicionar produtos, total em ¥ com conversão para a moeda do cliente.
 */
const RegisterSaleModal: React.FC<Props> = ({ request, adminName, onClose, onRegistered }) => {
  const { toast } = useToast();
  const nextId = useRef(2);
  const [rows, setRows] = useState<ItemRow[]>([{ id: 1, name: '', valueYen: '' }]);
  const [paymentMethod, setPaymentMethod] = useState<'wise' | 'pix'>('wise');
  const [currency, setCurrency] = useState<'JPY' | 'BRL' | 'EUR' | 'USD'>('JPY');
  const [saving, setSaving] = useState(false);
  // Cliente: vem do pedido ou é digitado (venda avulsa)
  const [custName, setCustName] = useState(request?.name || '');
  const [custContact, setCustContact] = useState(request?.contact || '');

  const totalYen = useMemo(
    () => rows.reduce((s, r) => s + (parseFloat(r.valueYen) || 0), 0),
    [rows]
  );
  const totalConverted = currency === 'JPY' ? totalYen : convertYen(totalYen, currency, true);

  const addRow = () => setRows((p) => [...p, { id: nextId.current++, name: '', valueYen: '' }]);
  const removeRow = (id: number) => setRows((p) => (p.length > 1 ? p.filter((r) => r.id !== id) : p));
  const updateRow = (id: number, field: 'name' | 'valueYen', value: string) =>
    setRows((p) => p.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const validItems = rows.filter((r) => r.name.trim() && (parseFloat(r.valueYen) || 0) > 0);

  const handleRegister = async () => {
    if (!custName.trim()) {
      toast({ title: 'Informe o nome do cliente', variant: 'destructive' });
      return;
    }
    if (validItems.length === 0) {
      toast({ title: 'Adicione ao menos 1 produto com nome e valor', variant: 'destructive' });
      return;
    }
    // E-mail do cliente: usa o contato se for e-mail, senão um placeholder a partir do nome
    const contact = custContact.trim();
    const email = contact.includes('@')
      ? contact
      : `${custName.trim().toLowerCase().replace(/\s+/g, '.')}@manual.local`;

    setSaving(true);
    const res = await orderService.createManualSale({
      customerName: custName.trim(),
      customerEmail: email,
      customerPhone: contact.includes('@') ? '' : contact,
      items: validItems.map((r) => ({ productName: r.name.trim(), priceYen: parseFloat(r.valueYen) || 0 })),
      paymentMethod,
      currency,
      linkedRequestId: request?.id,
      note: `Venda posterior${request?.productDesc ? ' — ' + request.productDesc.slice(0, 80) : ''}`,
      createdBy: adminName || '',
    });
    setSaving(false);

    if (res.ok) {
      toast({ title: '✅ Venda registrada!', description: `Pedido ${res.orderNumber} entrou como receita.` });
      onRegistered();
      onClose();
    } else {
      toast({ title: 'Erro ao registrar venda', description: res.error, variant: 'destructive' });
    }
  };

  const yen = (n: number) => `¥ ${Math.round(n).toLocaleString('ja-JP')}`;
  const conv = (n: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency === 'JPY' ? 'JPY' : currency,
    }).format(n);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" /> Registrar Venda
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {request ? 'Vinculada ao pedido personalizado' : 'Venda avulsa (Wise/PIX direto)'}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Aviso */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300">
            💡 Produtos cobrados fora do site (Wise/PIX direto). Ao registrar, esta venda entra como
            <strong> receita no Dashboard</strong> (pagamento confirmado).
          </div>

          {/* Cliente */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold block mb-1">Nome do cliente *</label>
              <input
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Ex: Maria Silva"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Contato (e-mail/WhatsApp)</label>
              <input
                value={custContact}
                onChange={(e) => setCustContact(e.target.value)}
                placeholder="email@exemplo.com ou +55..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
          </div>

          {/* Produtos (calculadora) */}
          <div>
            <label className="text-sm font-semibold block mb-2">Produtos vendidos</label>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={r.id} className="flex items-center gap-2">
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(r.id, 'name', e.target.value)}
                    placeholder={`Produto ${i + 1}`}
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                  <div className="relative w-32 shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                    <input
                      type="number"
                      min={0}
                      value={r.valueYen}
                      onChange={(e) => updateRow(r.id, 'valueYen', e.target.value)}
                      placeholder="valor"
                      className="w-full pl-5 pr-2 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>
                  <button
                    onClick={() => removeRow(r.id)}
                    disabled={rows.length === 1}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 mt-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-4 h-4" /> Adicionar produto
            </button>
          </div>

          {/* Forma de pagamento + moeda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold block mb-1">Forma de pagamento</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'wise' | 'pix')}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              >
                <option value="wise">Wise</option>
                <option value="pix">PIX</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Moeda do valor digitado</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              >
                <option value="JPY">¥ Ienes (JPY)</option>
                <option value="BRL">R$ Real (BRL)</option>
                <option value="EUR">€ Euro (EUR)</option>
                <option value="USD">$ Dólar (USD)</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Os valores são digitados em ienes (¥). A moeda escolhida é só para exibir a conversão ao cliente.
          </p>

          {/* Total */}
          <div className="bg-secondary/40 rounded-xl p-4 flex items-center justify-between">
            <span className="font-semibold">Total da venda</span>
            <div className="text-right">
              <p className="text-2xl font-black text-green-600">{yen(totalYen)}</p>
              {currency !== 'JPY' && (
                <p className="text-xs text-muted-foreground">≈ {conv(totalConverted)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-border sticky bottom-0 bg-card">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={handleRegister}
            disabled={saving || validItems.length === 0}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            {saving ? 'Registrando...' : `Registrar (${yen(totalYen)})`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RegisterSaleModal;
