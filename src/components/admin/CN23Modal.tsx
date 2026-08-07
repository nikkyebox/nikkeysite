import React, { useState, useEffect } from 'react';
import { X, Printer, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRates } from '@/services/fxService';
import { COMPANY_PROFILE } from '@/config/companyProfile';

interface CN23Item {
  description: string;
  descriptionEn: string;
  quantity: number;
  weightG: number;
  unitValueJpy: number;
  hsCode: string;
}

interface CN23ModalProps {
  order: any;
  onClose: () => void;
}

const DEFAULT_SENDER = {
  name: `${COMPANY_PROFILE.contactName} / ${COMPANY_PROFILE.brand}`,
  address: COMPANY_PROFILE.fulfillmentOrigin.formatted,
  country: COMPANY_PROFILE.fulfillmentOrigin.country,
  phone: COMPANY_PROFILE.whatsapp.international,
  email: COMPANY_PROFILE.email,
};

// Basic JP→EN product category hints
const guessCategory = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('cosmetic') || n.includes('skin') || n.includes('cream') || n.includes('serum') || n.includes('loção') || n.includes('creme') || n.includes('hidra') || n.includes('美容') || n.includes('化粧')) return 'Cosmetics';
  if (n.includes('toy') || n.includes('brinquedo') || n.includes('boneca') || n.includes('おもちゃ')) return 'Toy';
  if (n.includes('roupa') || n.includes('camiseta') || n.includes('cloth') || n.includes('shirt') || n.includes('服')) return 'Clothing';
  if (n.includes('eletrônico') || n.includes('eletronico') || n.includes('electric') || n.includes('電')) return 'Electronics';
  if (n.includes('alimento') || n.includes('food') || n.includes('snack') || n.includes('食')) return 'Food';
  if (n.includes('livro') || n.includes('book') || n.includes('本')) return 'Book';
  return 'General Merchandise';
};

const CN23Modal: React.FC<CN23ModalProps> = ({ order, onClose }) => {
  const [sender, setSender] = useState(DEFAULT_SENDER);
  const [recipient, setRecipient] = useState({
    name: order.shippingAddress?.name || order.name || '',
    address: [
      order.shippingAddress?.address || order.address || '',
      order.shippingAddress?.building || order.building || '',
      order.shippingAddress?.city || order.city || '',
      order.shippingAddress?.prefecture || order.prefecture || '',
      order.shippingAddress?.postalCode || order.postalCode || '',
    ].filter(Boolean).join(', '),
    country: 'Brazil',
    phone: order.phone || order.shippingAddress?.phone || '',
    cpf: order.cpf || '',
  });
  const [items, setItems] = useState<CN23Item[]>([]);
  const [category, setCategory] = useState<'gift' | 'commercial' | 'sample' | 'documents' | 'returned' | 'other'>('commercial');
  const [comments, setComments] = useState('Remessa Conforme');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    const currency = order.currency || 'BRL';
    const rates = getRates();
    const toJpy = (price: number): number => {
      if (!price) return 0;
      if (currency === 'JPY') return Math.round(price);
      if (currency === 'EUR') return Math.round(price / (rates.EUR || 0.006));
      // BRL → JPY
      return Math.round(price / (rates.BRL || 0.036));
    };

    const mapped: CN23Item[] = (order.items || []).map((it: any) => {
      const name = it.productName || it.name || '';
      // Try priceJpy first, then convert from order currency
      const unitPriceInCurrency = (it.price || 0) / (it.quantity || 1);
      const unitJpy = it.priceJpy
        ? Math.round(it.priceJpy)
        : toJpy(unitPriceInCurrency);
      return {
        description: name,
        descriptionEn: guessCategory(name),
        quantity: it.quantity || 1,
        weightG: 300,
        unitValueJpy: unitJpy,
        hsCode: '',
      };
    });
    setItems(mapped);
  }, [order]);

  const totalValueJpy = items.reduce((s, i) => s + i.unitValueJpy * i.quantity, 0);
  const totalWeightG = items.reduce((s, i) => s + i.weightG * i.quantity, 0) + 200;
  const formType = totalValueJpy <= 10000 ? 'CN22' : 'CN23';

  const updateItem = (idx: number, field: keyof CN23Item, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems(prev => [...prev, { description: '', descriptionEn: '', quantity: 1, weightG: 300, unitValueJpy: 0, hsCode: '' }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const printForm = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const totalWeightKg = (totalWeightG / 1000).toFixed(3);

    const cn22Html = `
      <div style="border:2px solid #000;padding:12px;width:380px;font-family:Arial,sans-serif;font-size:10px;">
        <div style="background:#4caf50;color:#fff;padding:4px 8px;font-weight:bold;font-size:12px;margin-bottom:8px;">
          CN22 — CUSTOMS DECLARATION / DÉCLARATION EN DOUANE
        </div>
        <p style="margin:2px 0;font-size:9px;">⚠️ May be opened officially / Peut être ouvert d'office</p>
        <div style="margin:8px 0;">
          <label style="font-weight:bold;">Category:</label>
          <span style="margin-left:8px;">☐ Gift &nbsp; ☐ Documents &nbsp; ${category === 'commercial' ? '☑' : '☐'} Commercial sample &nbsp; ☐ Returned goods &nbsp; ${category === 'other' ? '☑' : '☐'} Other</span>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:8px 0;">
          <thead>
            <tr style="background:#eee;">
              <th style="border:1px solid #ccc;padding:3px;text-align:left;">Contents description</th>
              <th style="border:1px solid #ccc;padding:3px;">Qty</th>
              <th style="border:1px solid #ccc;padding:3px;">Value (JPY)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(it => `
              <tr>
                <td style="border:1px solid #ccc;padding:3px;">${it.descriptionEn || it.description}</td>
                <td style="border:1px solid #ccc;padding:3px;text-align:center;">${it.quantity}</td>
                <td style="border:1px solid #ccc;padding:3px;text-align:right;">¥${(it.unitValueJpy * it.quantity).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="border-top:1px solid #000;padding-top:6px;margin-top:6px;display:flex;justify-content:space-between;">
          <span><b>Total Weight:</b> ${totalWeightKg} kg</span>
          <span><b>Total Value:</b> JPY ${totalValueJpy.toLocaleString()}</span>
        </div>
        <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:flex-end;">
          <div>
            <p style="margin:0;font-size:9px;">Sender's signature & date:</p>
            <p style="margin:4px 0 0 0;border-bottom:1px solid #000;width:180px;padding-bottom:8px;">${dateStr}</p>
          </div>
        </div>
        ${comments ? `<p style="font-size:9px;margin-top:6px;font-style:italic;">Comments: ${comments}</p>` : ''}
      </div>`;

    const cn23Html = `
      <div style="font-family:Arial,sans-serif;font-size:10px;max-width:800px;margin:0 auto;border:2px solid #000;padding:0;">
        <div style="background:#d32f2f;color:#fff;padding:6px 12px;font-weight:bold;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
          <span>CN23 — CUSTOMS DECLARATION / DÉCLARATION EN DOUANE</span>
          <span style="font-size:10px;font-weight:normal;">Pedido: ${order.orderNumber || 'N/A'}</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
          <div style="border-right:1px solid #ccc;border-bottom:1px solid #ccc;padding:10px;">
            <div style="font-weight:bold;font-size:9px;color:#666;text-transform:uppercase;margin-bottom:6px;">FROM / EXPÉDITEUR</div>
            <p style="margin:2px 0;font-weight:bold;">${sender.name}</p>
            <p style="margin:2px 0;">${sender.address}</p>
            <p style="margin:2px 0;">${sender.country}</p>
            <p style="margin:2px 0;">Tel: ${sender.phone}</p>
          </div>
          <div style="border-bottom:1px solid #ccc;padding:10px;">
            <div style="font-weight:bold;font-size:9px;color:#666;text-transform:uppercase;margin-bottom:6px;">TO / DESTINATAIRE</div>
            <p style="margin:2px 0;font-weight:bold;">${recipient.name}</p>
            <p style="margin:2px 0;">${recipient.address}</p>
            <p style="margin:2px 0;">${recipient.country}</p>
            ${recipient.phone ? `<p style="margin:2px 0;">Tel: ${recipient.phone}</p>` : ''}
            ${recipient.cpf ? `<p style="margin:2px 0;">CPF: ${recipient.cpf}</p>` : ''}
          </div>
        </div>

        <div style="padding:10px;border-bottom:1px solid #ccc;">
          <div style="font-weight:bold;font-size:9px;color:#666;text-transform:uppercase;margin-bottom:6px;">CATEGORY / CATÉGORIE</div>
          <span>☐ Gift &nbsp;&nbsp; ${category === 'commercial' ? '☑' : '☐'} Commercial &nbsp;&nbsp; ☐ Sample &nbsp;&nbsp; ☐ Documents &nbsp;&nbsp; ☐ Returned goods &nbsp;&nbsp; ${category === 'other' ? '☑' : '☐'} Other</span>
        </div>

        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="border:1px solid #ccc;padding:5px;text-align:left;font-size:9px;">Detailed description of contents</th>
              <th style="border:1px solid #ccc;padding:5px;font-size:9px;">HS Code</th>
              <th style="border:1px solid #ccc;padding:5px;font-size:9px;">Qty</th>
              <th style="border:1px solid #ccc;padding:5px;font-size:9px;">Net wt. (kg)</th>
              <th style="border:1px solid #ccc;padding:5px;font-size:9px;">Unit value (JPY)</th>
              <th style="border:1px solid #ccc;padding:5px;font-size:9px;">Total value (JPY)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(it => `
              <tr>
                <td style="border:1px solid #ccc;padding:5px;">${it.descriptionEn || it.description}</td>
                <td style="border:1px solid #ccc;padding:5px;text-align:center;">${it.hsCode || '—'}</td>
                <td style="border:1px solid #ccc;padding:5px;text-align:center;">${it.quantity}</td>
                <td style="border:1px solid #ccc;padding:5px;text-align:center;">${((it.weightG * it.quantity) / 1000).toFixed(3)}</td>
                <td style="border:1px solid #ccc;padding:5px;text-align:right;">¥${it.unitValueJpy.toLocaleString()}</td>
                <td style="border:1px solid #ccc;padding:5px;text-align:right;">¥${(it.unitValueJpy * it.quantity).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:bold;background:#f9f9f9;">
              <td colspan="3" style="border:1px solid #ccc;padding:5px;text-align:right;">TOTALS</td>
              <td style="border:1px solid #ccc;padding:5px;text-align:center;">${(totalWeightG / 1000).toFixed(3)}</td>
              <td style="border:1px solid #ccc;padding:5px;"></td>
              <td style="border:1px solid #ccc;padding:5px;text-align:right;">¥${totalValueJpy.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>

        ${comments ? `
        <div style="padding:8px 10px;border-top:1px solid #ccc;font-size:9px;">
          <b>Comments / Observations:</b> ${comments}
        </div>` : ''}

        <div style="padding:10px;border-top:1px solid #ccc;display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <div>
            <p style="font-size:9px;margin:0 0 4px;">I certify that the particulars given in this customs declaration are correct and that this item does not contain any dangerous article.</p>
            <p style="font-size:9px;margin:8px 0 2px;">Sender's signature: _______________________</p>
            <p style="font-size:9px;margin:0;">Date: ${dateStr}</p>
          </div>
          <div style="text-align:right;font-size:9px;">
            <p style="margin:2px 0;">Postage: ¥ ___________</p>
            <p style="margin:2px 0;">Insurance: ¥ ___________</p>
            <p style="margin:6px 0 0;font-weight:bold;">Order: ${order.orderNumber || 'N/A'}</p>
          </div>
        </div>
      </div>`;

    win.document.write(`<!DOCTYPE html><html><head>
      <title>${formType} - ${order.orderNumber}</title>
      <style>
        body { margin: 20px; font-family: Arial, sans-serif; }
        @media print { body { margin: 0; } .no-print { display: none !important; } }
      </style>
    </head><body>
      <div class="no-print" style="margin-bottom:16px;display:flex;gap:12px;align-items:center;">
        <button onclick="window.print()" style="padding:8px 20px;font-size:14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer;">
          🖨️ Imprimir ${formType}
        </button>
        <button onclick="window.close()" style="padding:8px 16px;font-size:14px;border:1px solid #ccc;border-radius:6px;cursor:pointer;">✕ Fechar</button>
        <span style="font-size:12px;color:#666;">Formulário ${formType} • Pedido ${order.orderNumber || 'N/A'} • ${dateStr}</span>
      </div>
      ${formType === 'CN22' ? cn22Html : cn23Html}
    </body></html>`);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto py-6 px-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" />
            <div>
              <h2 className="font-bold text-lg">Declaração Aduaneira {formType}</h2>
              <p className="text-xs text-muted-foreground">
                Pedido #{order.orderNumber || 'N/A'} · Total: ¥{totalValueJpy.toLocaleString()} ·
                <span className={`ml-1 font-semibold ${formType === 'CN22' ? 'text-green-600' : 'text-red-600'}`}>
                  {formType === 'CN22' ? '≤ ¥10.000 → CN22' : '> ¥10.000 → CN23'}
                </span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(['edit', 'preview'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'edit' ? '✏️ Editar Dados' : '👁 Preview Formulário'}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {activeTab === 'edit' ? (
            <>
              {/* Info box */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-xs text-blue-800 dark:text-blue-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Dica:</strong> O nome em inglês é o que aparece no formulário para a aduana. Você pode declarar um valor menor que o valor de venda do site — coloque o valor real que pagou pelo produto.
                  Formulário <strong>{formType}</strong> é gerado automaticamente com base no valor total: CN22 ≤ ¥10.000, CN23 &gt; ¥10.000.
                </div>
              </div>

              {/* Items */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm">Itens para Declaração</h3>
                  <button
                    onClick={addItem}
                    className="text-xs text-primary hover:underline font-semibold"
                  >
                    + Adicionar item
                  </button>
                </div>
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="bg-secondary/30 rounded-xl p-3 border border-border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Nome original (PT/JP)</label>
                          <input
                            value={item.description}
                            onChange={e => updateItem(idx, 'description', e.target.value)}
                            className="w-full mt-1 p-2 text-sm rounded-lg border border-border bg-background"
                            placeholder="Nome do produto"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Nome em inglês (para aduana) ✱</label>
                          <input
                            value={item.descriptionEn}
                            onChange={e => updateItem(idx, 'descriptionEn', e.target.value)}
                            className="w-full mt-1 p-2 text-sm rounded-lg border border-primary/50 bg-background font-semibold"
                            placeholder="Ex: Cosmetics, Toy, Clothing..."
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Qtd</label>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-full mt-1 p-2 text-sm rounded-lg border border-border bg-background text-center"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Peso unit. (g)</label>
                          <input
                            type="number"
                            min={1}
                            value={item.weightG}
                            onChange={e => updateItem(idx, 'weightG', parseInt(e.target.value) || 0)}
                            className="w-full mt-1 p-2 text-sm rounded-lg border border-border bg-background text-center"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Valor unit. declarado (¥) ✱</label>
                          <input
                            type="number"
                            min={0}
                            value={item.unitValueJpy}
                            onChange={e => updateItem(idx, 'unitValueJpy', parseInt(e.target.value) || 0)}
                            className="w-full mt-1 p-2 text-sm rounded-lg border border-primary/50 bg-background font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">HS Code</label>
                          <input
                            value={item.hsCode}
                            onChange={e => updateItem(idx, 'hsCode', e.target.value)}
                            className="w-full mt-1 p-2 text-sm rounded-lg border border-border bg-background text-center"
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                        <span className="text-xs text-muted-foreground">
                          Subtotal: <strong>¥{(item.unitValueJpy * item.quantity).toLocaleString()}</strong> · {((item.weightG * item.quantity)/1000).toFixed(3)} kg
                        </span>
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-xs text-red-500 hover:text-red-700">
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 bg-primary/5 rounded-xl p-3 flex items-center justify-between text-sm font-bold">
                  <span>Total declarado:</span>
                  <span className="text-primary text-lg">¥{totalValueJpy.toLocaleString()} · {(totalWeightG/1000).toFixed(3)} kg</span>
                </div>
              </section>

              {/* Sender */}
              <section>
                <h3 className="font-bold text-sm mb-3">Remetente (From)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(Object.keys(sender) as (keyof typeof sender)[]).map(field => (
                    <div key={field}>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">{field}</label>
                      <input
                        value={sender[field]}
                        onChange={e => setSender(prev => ({ ...prev, [field]: e.target.value }))}
                        className="w-full mt-1 p-2 text-sm rounded-lg border border-border bg-background"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Recipient */}
              <section>
                <h3 className="font-bold text-sm mb-3">Destinatário (To)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(Object.keys(recipient) as (keyof typeof recipient)[]).map(field => (
                    <div key={field}>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">{field}</label>
                      <input
                        value={recipient[field]}
                        onChange={e => setRecipient(prev => ({ ...prev, [field]: e.target.value }))}
                        className="w-full mt-1 p-2 text-sm rounded-lg border border-border bg-background"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Category & Comments */}
              <section>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-bold text-sm mb-2">Categoria</h3>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value as any)}
                      className="w-full p-2.5 rounded-lg border border-border bg-background text-sm"
                    >
                      <option value="commercial">Comercial (Commercial sample)</option>
                      <option value="gift">Presente (Gift)</option>
                      <option value="sample">Amostra (Sample)</option>
                      <option value="documents">Documentos (Documents)</option>
                      <option value="returned">Devolução (Returned goods)</option>
                      <option value="other">Outro (Other)</option>
                    </select>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm mb-2">Observações (Comments)</h3>
                    <input
                      value={comments}
                      onChange={e => setComments(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-border bg-background text-sm"
                      placeholder="Ex: Remessa Conforme"
                    />
                  </div>
                </div>
              </section>
            </>
          ) : (
            /* Preview */
            <div className="bg-white dark:bg-gray-50 rounded-xl p-6 border border-border text-gray-900 text-xs font-mono">
              {formType === 'CN22' ? (
                <div style={{ border: '2px solid #000', padding: '12px', maxWidth: '380px' }}>
                  <div style={{ background: '#4caf50', color: '#fff', padding: '4px 8px', fontWeight: 'bold', fontSize: '12px', marginBottom: '8px' }}>
                    CN22 — CUSTOMS DECLARATION
                  </div>
                  <p style={{ margin: '2px 0', fontSize: '9px' }}>⚠️ May be opened officially</p>
                  <div style={{ margin: '8px 0' }}>
                    <strong>Category:</strong> {category === 'commercial' ? '☑ Commercial' : category === 'gift' ? '☑ Gift' : `☑ ${category}`}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#eee' }}>
                        <th style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'left' }}>Contents</th>
                        <th style={{ border: '1px solid #ccc', padding: '3px' }}>Qty</th>
                        <th style={{ border: '1px solid #ccc', padding: '3px' }}>Value (JPY)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td style={{ border: '1px solid #ccc', padding: '3px' }}>{it.descriptionEn || it.description}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'center' }}>{it.quantity}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'right' }}>¥{(it.unitValueJpy * it.quantity).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ borderTop: '1px solid #000', marginTop: '6px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                    <span><strong>Weight:</strong> {(totalWeightG/1000).toFixed(3)} kg</span>
                    <span><strong>Total:</strong> ¥{totalValueJpy.toLocaleString()}</span>
                  </div>
                  {comments && <p style={{ marginTop: '4px', fontStyle: 'italic', fontSize: '9px' }}>Comments: {comments}</p>}
                  <p style={{ marginTop: '8px', fontSize: '9px' }}>Signature: _________________ Date: {new Date().toLocaleDateString('pt-BR')}</p>
                </div>
              ) : (
                <div style={{ border: '2px solid #000', maxWidth: '700px' }}>
                  <div style={{ background: '#d32f2f', color: '#fff', padding: '6px 12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                    <span>CN23 — CUSTOMS DECLARATION</span>
                    <span style={{ fontSize: '10px', fontWeight: 'normal' }}>#{order.orderNumber}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #ccc' }}>
                    <div style={{ borderRight: '1px solid #ccc', padding: '8px' }}>
                      <div style={{ fontSize: '9px', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>FROM</div>
                      <div style={{ fontWeight: 'bold' }}>{sender.name}</div>
                      <div>{sender.address}</div>
                      <div>{sender.country}</div>
                      <div>Tel: {sender.phone}</div>
                    </div>
                    <div style={{ padding: '8px' }}>
                      <div style={{ fontSize: '9px', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>TO</div>
                      <div style={{ fontWeight: 'bold' }}>{recipient.name}</div>
                      <div>{recipient.address}</div>
                      <div>{recipient.country}</div>
                      {recipient.phone && <div>Tel: {recipient.phone}</div>}
                      {recipient.cpf && <div>CPF: {recipient.cpf}</div>}
                    </div>
                  </div>
                  <div style={{ padding: '6px 8px', borderBottom: '1px solid #ccc', fontSize: '9px' }}>
                    <strong>Category:</strong> {category}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        {['Description', 'HS Code', 'Qty', 'Net wt. (kg)', 'Unit value (¥)', 'Total (¥)'].map(h => (
                          <th key={h} style={{ border: '1px solid #ccc', padding: '3px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td style={{ border: '1px solid #ccc', padding: '3px' }}>{it.descriptionEn || it.description}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'center' }}>{it.hsCode || '—'}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'center' }}>{it.quantity}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'center' }}>{((it.weightG * it.quantity)/1000).toFixed(3)}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'right' }}>¥{it.unitValueJpy.toLocaleString()}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'right' }}>¥{(it.unitValueJpy * it.quantity).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 'bold', background: '#f9f9f9' }}>
                        <td colSpan={3} style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'right' }}>TOTAL</td>
                        <td style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'center' }}>{(totalWeightG/1000).toFixed(3)}</td>
                        <td style={{ border: '1px solid #ccc', padding: '3px' }}></td>
                        <td style={{ border: '1px solid #ccc', padding: '3px', textAlign: 'right' }}>¥{totalValueJpy.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {comments && (
                    <div style={{ padding: '4px 8px', borderTop: '1px solid #ccc', fontSize: '9px' }}>
                      <strong>Comments:</strong> {comments}
                    </div>
                  )}
                  <div style={{ padding: '8px', borderTop: '1px solid #ccc', fontSize: '9px' }}>
                    Signature: _________________________ Date: {new Date().toLocaleDateString('pt-BR')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-border bg-secondary/20 rounded-b-2xl">
          <div className="text-xs text-muted-foreground">
            Peso total estimado: <strong>{(totalWeightG/1000).toFixed(3)} kg</strong> ·
            Valor declarado: <strong>¥{totalValueJpy.toLocaleString()}</strong> ·
            Formulário: <strong className={formType === 'CN22' ? 'text-green-600' : 'text-red-600'}>{formType}</strong>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            <Button onClick={printForm} className="gap-2">
              <Printer className="w-4 h-4" />
              Imprimir {formType}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CN23Modal;
