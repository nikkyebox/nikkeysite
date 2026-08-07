import React, { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, Edit2, Calendar, Percent, DollarSign, Check, X, Gift, Star, Users, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { couponService } from '@/services/couponService';
import type { Coupon } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { firebaseSyncService } from '@/services/firebaseSyncService';
import { ensureAdminAuth } from '@/utils/adminAuth';
import { useUser } from '@/context/UserContext';

const CouponManager: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  const { addCoupon } = useUser();

  const [formData, setFormData] = useState({
    code: '',
    type: 'percent' as 'fixed' | 'percent',
    discount: 0,
    discountPercent: 0,
    expiryDate: '',
    usageLimit: 0,
    minOrderValue: 0,
    description: '',
    targetType: 'all' as 'all' | 'specific' | 'birthday' | 'loyalty',
    targetEmails: '',
    minOrders: 0,
    freeShipping: false,
  });

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    // Load from Firestore to get the latest data
    const allCoupons = await couponService.getAllAsync();
    setCoupons(allCoupons);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value
    }));
  };

  const handleTypeChange = (type: 'fixed' | 'percent') => {
    setFormData(prev => ({ ...prev, type }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      toast({
        title: "Erro",
        description: "Código do cupom é obrigatório",
        variant: "destructive",
      });
      return;
    }

    if (formData.type === 'fixed' && formData.discount <= 0) {
      toast({
        title: "Erro",
        description: "Valor do desconto deve ser maior que 0",
        variant: "destructive",
      });
      return;
    }

    if (formData.type === 'percent' && (formData.discountPercent <= 0 || formData.discountPercent > 100)) {
      toast({
        title: "Erro",
        description: "Porcentagem deve estar entre 1 e 100",
        variant: "destructive",
      });
      return;
    }

    try {
      const code = formData.code.toUpperCase();
      const expiry = formData.expiryDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const emails = formData.targetType === 'specific' && formData.targetEmails
        ? formData.targetEmails.split(',').map(e => e.trim()).filter(Boolean)
        : [];

      // 1) Registra o cupom na lista global (para histórico/visualização)
      couponService.create({
        code,
        type: formData.type,
        discount: formData.type === 'fixed' ? formData.discount : 0,
        discountPercent: formData.type === 'percent' ? formData.discountPercent : undefined,
        expiryDate: expiry,
        usageLimit: formData.usageLimit || undefined,
        description: formData.description || 'Cupom de desconto',
        isActive: true,
        targetType: formData.targetType,
        targetEmails: emails.length ? emails : undefined,
        minOrders: formData.targetType === 'loyalty' ? formData.minOrders : undefined,
        freeShipping: formData.freeShipping,
        minOrderValue: formData.minOrderValue || undefined,
      });

      // 2) Concede o cupom ao PERFIL dos clientes (para aparecer em "Meus Cupons")
      const profileCoupon = {
        id: `cm-${Date.now()}`,
        code,
        description: formData.description || 'Cupom de desconto',
        discount: formData.type === 'fixed' ? formData.discount : formData.discountPercent,
        discountType: formData.type === 'fixed' ? ('fixed' as const) : ('percentage' as const),
        expiresAt: new Date(expiry).toISOString(),
        isUsed: false,
        freeShipping: formData.freeShipping,
      };

      await ensureAdminAuth();
      let grantInfo = '';
      if (formData.targetType === 'specific' && emails.length) {
        let total = 0;
        for (const email of emails) {
          const res = await firebaseSyncService.grantCouponToUserByEmail(email, profileCoupon);
          if (res.success) total += res.granted;
        }
        grantInfo = ` · adicionado a ${total} cliente(s)`;
      } else {
        // 'all', 'birthday' e 'loyalty' → concede a todos os perfis
        const res = await firebaseSyncService.grantCouponToAllUsers(profileCoupon);
        if (res.success) grantInfo = ` · adicionado a ${res.granted} cliente(s)`;
      }

      toast({
        title: "Cupom criado!",
        description: `Cupom ${code} criado${grantInfo}`,
      });

      setFormData({
        code: '',
        type: 'percent',
        discount: 0,
        discountPercent: 0,
        expiryDate: '',
        usageLimit: 0,
        minOrderValue: 0,
        description: '',
        targetType: 'all',
        targetEmails: '',
        minOrders: 0,
        freeShipping: false,
      });
      setIsCreating(false);
      loadCoupons();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao criar cupom",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = (code: string, isActive: boolean) => {
    couponService.update(code, { isActive: !isActive });
    loadCoupons();
    toast({
      title: isActive ? "Cupom desativado" : "Cupom ativado",
      description: `Cupom ${code} ${isActive ? 'desativado' : 'ativado'}`,
    });
  };

  const handleDelete = (code: string) => {
    if (confirm(`Tem certeza que deseja excluir o cupom ${code}?`)) {
      couponService.delete(code);
      loadCoupons();
      toast({
        title: "Cupom excluído",
        description: `Cupom ${code} foi excluído`,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Tag className="w-5 h-5 text-primary" />
          </div>
          <h2 className="font-display text-2xl font-semibold">Cupons de Desconto</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1.5 border-blue-300 text-blue-600 hover:bg-blue-50"
            onClick={async () => {
              try {
                await ensureAdminAuth();
                const profileCoupon = {
                  id: `teste20-${Date.now()}`,
                  code: 'TESTE20',
                  description: 'Cupom de teste — 20% de desconto',
                  discount: 20,
                  discountType: 'percentage' as const,
                  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                  isUsed: false,
                };
                couponService.create({ code: 'TESTE20', type: 'percent', discount: 0, discountPercent: 20, description: 'Cupom de teste', isActive: true, targetType: 'all', expiryDate: profileCoupon.expiresAt });
                // Adiciona imediatamente ao perfil do admin logado (sem precisar de reload)
                addCoupon(profileCoupon as any);
                const res = await firebaseSyncService.grantCouponToAllUsers(profileCoupon);
                toast({ title: '🎟️ TESTE20 criado', description: `Concedido a ${res.granted ?? 0} cliente(s). Código: TESTE20 — 20% OFF` });
                loadCoupons();
              } catch (e: any) {
                toast({ title: 'Erro', description: e?.message, variant: 'destructive' });
              }
            }}>
            <Star className="w-3.5 h-3.5" /> TESTE20
          </Button>
          <Button onClick={() => setIsCreating(!isCreating)} className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Novo Cupom
          </Button>
        </div>
      </div>

      {isCreating && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-4">Criar Novo Cupom</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código do Cupom *</Label>
                <Input
                  id="code"
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  placeholder="EX: BEMVINDO10"
                  required
                  className="uppercase"
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Desconto *</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={formData.type === 'percent' ? 'default' : 'outline'}
                    onClick={() => handleTypeChange('percent')}
                    className="flex-1"
                  >
                    <Percent className="w-4 h-4 mr-2" />
                    Porcentagem
                  </Button>
                  <Button
                    type="button"
                    variant={formData.type === 'fixed' ? 'default' : 'outline'}
                    onClick={() => handleTypeChange('fixed')}
                    className="flex-1"
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Valor Fixo
                  </Button>
                </div>
              </div>

              {formData.type === 'percent' ? (
                <div className="space-y-2">
                  <Label htmlFor="discountPercent">Porcentagem de Desconto (%) *</Label>
                  <Input
                    id="discountPercent"
                    name="discountPercent"
                    type="number"
                    min="1"
                    max="100"
                    value={formData.discountPercent}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="discount">Valor do Desconto (¥) *</Label>
                  <Input
                    id="discount"
                    name="discount"
                    type="number"
                    min="1"
                    value={formData.discount}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="expiryDate">Data de Expiração</Label>
                <Input
                  id="expiryDate"
                  name="expiryDate"
                  type="date"
                  value={formData.expiryDate}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="usageLimit">Limite de Uso (0 = ilimitado)</Label>
                <Input
                  id="usageLimit"
                  name="usageLimit"
                  type="number"
                  min="0"
                  value={formData.usageLimit}
                  onChange={handleInputChange}
                />
                {formData.usageLimit > 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded">
                    🏆 <strong>Primeiros {formData.usageLimit} compradores</strong> — o cupom se desativa automaticamente após {formData.usageLimit} usos.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="minOrderValue">Valor Mínimo do Pedido (¥) — 0 = sem mínimo</Label>
                <Input
                  id="minOrderValue"
                  name="minOrderValue"
                  type="number"
                  min="0"
                  value={formData.minOrderValue}
                  onChange={handleInputChange}
                />
                {formData.minOrderValue > 0 && (
                  <p className="text-[11px] text-blue-700 bg-blue-50 px-2 py-1 rounded">
                    O cupom só será válido em pedidos acima de ¥{formData.minOrderValue.toLocaleString()}.
                  </p>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Descrição</Label>
                <Input
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Ex: Cupom de boas-vindas"
                />
              </div>

              {/* Targeting */}
              <div className="space-y-2 md:col-span-2">
                <Label>Quem pode usar este cupom?</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all', label: 'Todos', icon: <Users className="w-4 h-4 mr-1" /> },
                    { value: 'specific', label: 'Clientes Específicos', icon: <Tag className="w-4 h-4 mr-1" /> },
                    { value: 'birthday', label: 'Aniversariantes do Mês', icon: <Gift className="w-4 h-4 mr-1" /> },
                    { value: 'loyalty', label: 'Fidelidade (Qtd Pedidos)', icon: <Star className="w-4 h-4 mr-1" /> },
                  ].map(opt => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={formData.targetType === opt.value ? 'default' : 'outline'}
                      onClick={() => setFormData(prev => ({ ...prev, targetType: opt.value as any }))}
                      className="flex items-center"
                      size="sm"
                    >
                      {opt.icon}
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {formData.targetType === 'specific' && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="targetEmails">Emails dos clientes (separados por vírgula)</Label>
                  <Input
                    id="targetEmails"
                    name="targetEmails"
                    value={formData.targetEmails}
                    onChange={handleInputChange}
                    placeholder="email1@exemplo.com, email2@exemplo.com"
                  />
                </div>
              )}

              {formData.targetType === 'loyalty' && (
                <div className="space-y-2">
                  <Label htmlFor="minOrders">Mínimo de pedidos no histórico</Label>
                  <Input
                    id="minOrders"
                    name="minOrders"
                    type="number"
                    min="1"
                    value={formData.minOrders}
                    onChange={handleInputChange}
                  />
                </div>
              )}

              {/* Free Shipping option */}
              <div className="space-y-2 md:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="freeShipping"
                    checked={formData.freeShipping}
                    onChange={handleInputChange}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <Truck className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Frete Grátis (cupom dá frete grátis ao invés de desconto no valor)</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="btn-primary">
                Criar Cupom
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {coupons.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-xl border border-border">
            <Tag className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum cupom cadastrado</p>
          </div>
        ) : (
          coupons.map((coupon) => {
            const isExpired = new Date(coupon.expiryDate) < new Date();
            const isExhausted = coupon.usageLimit && coupon.usedCount >= coupon.usageLimit;
            
            return (
              <div
                key={coupon.code}
                className={`bg-card rounded-xl border p-6 ${
                  !coupon.isActive || isExpired || isExhausted
                    ? 'border-border opacity-60'
                    : 'border-primary/20'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-lg font-mono">{coupon.code}</h3>
                      {coupon.isActive && !isExpired && !isExhausted ? (
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs rounded-full">
                          Ativo
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs rounded-full">
                          Inativo
                        </span>
                      )}
                      {isExpired && (
                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 text-xs rounded-full">
                          Expirado
                        </span>
                      )}
                      {isExhausted && (
                        <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 text-xs rounded-full">
                          Esgotado
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mb-4">{coupon.description}</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">Desconto</p>
                        <p className="font-semibold">
                          {coupon.freeShipping ? '🚚 Frete Grátis' : coupon.type === 'percent'
                            ? `${coupon.discountPercent}%`
                            : `¥${coupon.discount.toLocaleString()}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">Público</p>
                        <p className="font-semibold flex items-center gap-1">
                          {(!coupon.targetType || coupon.targetType === 'all') && <><Users className="w-3 h-3" /> Todos</>}
                          {coupon.targetType === 'specific' && <><Tag className="w-3 h-3" /> Específico</>}
                          {coupon.targetType === 'birthday' && <><Gift className="w-3 h-3" /> Aniversário</>}
                          {coupon.targetType === 'loyalty' && <><Star className="w-3 h-3" /> {coupon.minOrders}+ pedidos</>}
                        </p>
                        {coupon.targetType === 'specific' && coupon.targetEmails && (
                          <p className="text-xs text-muted-foreground mt-1 truncate max-w-[180px]" title={coupon.targetEmails.join(', ')}>
                            {coupon.targetEmails.join(', ')}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">Validade</p>
                        <p className="font-semibold">
                          {new Date(coupon.expiryDate).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">Usos</p>
                        <p className="font-semibold">
                          {coupon.usedCount}
                          {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ' / ∞'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">Criado em</p>
                        <p className="font-semibold">
                          {new Date(coupon.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(coupon.code, coupon.isActive)}
                      title={coupon.isActive ? 'Desativar' : 'Ativar'}
                    >
                      {coupon.isActive ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(coupon.code)}
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CouponManager;
