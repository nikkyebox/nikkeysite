import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Link2, Copy, Check, DollarSign, Package, TrendingUp, Percent, Clock, PlayCircle, X, Trophy } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useUser } from '@/context/UserContext';
import { useProducts } from '@/context/ProductsContext';
import { useToast } from '@/hooks/use-toast';
import { affiliateService, TIER_CONFIG } from '@/services/affiliateService';
import type { AffiliateDashboard, AffiliateTier } from '@/services/affiliateService';

const SITE_URL = 'https://nikkeybox-store.com';

const AffiliatePage: React.FC = () => {
  const { user, isAuthenticated } = useUser();
  const { products } = useProducts();
  const { toast } = useToast();
  const [affiliates, setAffiliates] = useState<AffiliateDashboard[]>([]);
  const [pendingByCode, setPendingByCode] = useState<Record<string, { commissionYen: number; netYen: number; orders: number }>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [showTierModal, setShowTierModal] = useState(false);

  useEffect(() => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    affiliateService.getByOwnerEmail(user.email).then(async (list) => {
      setAffiliates(list);
      const map: Record<string, { commissionYen: number; netYen: number; orders: number }> = {};
      await Promise.all(
        list.map(async (aff) => {
          const pend = await affiliateService.getPendingByCode(aff.code);
          map[aff.code] = {
            commissionYen: pend.reduce((sum, p) => sum + (p.commissionYen || 0), 0),
            netYen: pend.reduce((sum, p) => sum + (p.netYen || 0), 0),
            orders: pend.length,
          };
        })
      );
      setPendingByCode(map);
      setLoading(false);
    });
  }, [user?.email]);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast({ title: 'Copiado!', description: text });
    setTimeout(() => setCopied(null), 2000);
  };

  const yen = (v: number) => `¥${(v || 0).toLocaleString()}`;

  return (
    <Layout>
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary font-semibold text-sm px-4 py-1.5 rounded-full mb-4">
            <Megaphone className="w-4 h-4" /> Programa de Afiliados
          </div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-3">
            Painel do Influencer
          </h1>
          <p className="text-muted-foreground text-lg">
            Acompanhe suas indicações e comissões
          </p>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          {!isAuthenticated ? (
            <div className="text-center py-16 bg-card rounded-2xl border border-border">
              <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-6">Entre na sua conta para ver seu painel de afiliado.</p>
              <Button asChild className="btn-primary"><Link to="/login">Entrar</Link></Button>
            </div>
          ) : loading ? (
            <div className="text-center py-16 text-muted-foreground">Carregando...</div>
          ) : affiliates.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-2xl border border-border">
              <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="font-display text-2xl font-bold mb-2">Você ainda não é afiliado</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                O programa de afiliados é por convite. Entre em contato com a loja para se tornar um
                influencer parceiro e ganhar comissão divulgando seu código.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {affiliates.map((aff) => {
                const link = `${SITE_URL}/?ref=${aff.code}`;
                const expired = new Date(aff.expiresAt) < new Date();
                const pend = pendingByCode[aff.code] || { commissionYen: 0, netYen: 0, orders: 0 };
                const totalVendas = (aff.totalOrders || 0) + pend.orders;
                const totalReceita = (aff.totalRevenue || 0) + pend.netYen;
                return (
                  <div key={aff.code} className="bg-card rounded-2xl border border-border p-6 lg:p-8 space-y-6">
                    {/* Header com código */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase font-bold text-muted-foreground">Seu código</p>
                        <p className="font-display text-3xl font-extrabold text-primary font-mono">{aff.code}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowTierModal(true)}
                          className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                        >
                          <Trophy className="w-4 h-4" />
                          Metas do Afiliado
                        </Button>
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${aff.active && !expired ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {expired ? 'Expirado' : aff.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>

                    {/* Métricas */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-secondary/30 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Percent className="w-3 h-3" /> Desconto</p>
                        <p className="text-xl font-bold">{aff.discountPercent}%</p>
                        <p className="text-[10px] text-muted-foreground">para quem usa</p>
                      </div>
                      <div className="bg-secondary/30 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Package className="w-3 h-3" /> Vendas</p>
                        <p className="text-xl font-bold">{totalVendas}</p>
                        {pend.orders > 0 && (
                          <p className="text-[10px] text-amber-600">{pend.orders} aguardando entrega</p>
                        )}
                      </div>
                      <div className="bg-secondary/30 rounded-xl p-4">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><TrendingUp className="w-3 h-3" /> Receita gerada</p>
                        <p className="text-xl font-bold">{yen(totalReceita)}</p>
                        {pend.netYen > 0 && (
                          <p className="text-[10px] text-amber-600">{yen(pend.netYen)} pendente</p>
                        )}
                      </div>
                      <div className="bg-primary/10 rounded-xl p-4 border border-primary/20">
                        <p className="text-xs text-primary flex items-center gap-1 mb-1"><DollarSign className="w-3 h-3" /> Comissão liberada</p>
                        <p className="text-xl font-bold text-primary">{yen(aff.totalEarnings)}</p>
                        <p className="text-[10px] text-muted-foreground">{aff.commissionPercent}% das vendas</p>
                        {/* Badge de nível */}
                        {(() => {
                          const tier: AffiliateTier = aff.tier || 'bronze';
                          const cfg = TIER_CONFIG[tier];
                          const monthRev = aff.currentMonthRevenue || 0;
                          const progress = Math.min(100, Math.round((monthRev / cfg.goalYen) * 100));
                          const nextCfg = cfg.nextTier ? TIER_CONFIG[cfg.nextTier] : null;
                          return (
                            <div className="mt-2 space-y-1.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                tier === 'gold'   ? 'bg-yellow-100 text-yellow-700' :
                                tier === 'silver' ? 'bg-gray-100 text-gray-600' :
                                                    'bg-pink-100 text-pink-700'
                              }`}>{cfg.emoji} {cfg.label}</span>
                              <div>
                                <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                                  <span>Este mês: ¥{monthRev.toLocaleString()}</span>
                                  <span>Meta: ¥{cfg.goalYen.toLocaleString()}</span>
                                </div>
                                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${progress >= 100 ? 'bg-green-500' : progress >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                                    style={{ width: `${progress}%` }} />
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {progress >= 100
                                    ? `✅ Meta batida!${nextCfg ? ` → ${nextCfg.emoji} ${nextCfg.label} no próximo mês` : ''}`
                                    : `Faltam ¥${(cfg.goalYen - monthRev).toLocaleString()} para ${nextCfg ? `subir para ${nextCfg.emoji} ${nextCfg.label}` : 'manter Ouro'}`}
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                        {pend.commissionYen > 0 && (
                          <div className="mt-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 border border-amber-200 dark:border-amber-800">
                            <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 font-semibold">
                              <Clock className="w-3 h-3" /> {yen(pend.commissionYen)} a liberar
                            </p>
                            <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80">
                              Liberado após confirmação de entrega
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Link de indicação */}
                    <div>
                      <p className="text-xs uppercase font-bold text-muted-foreground mb-2 flex items-center gap-1"><Link2 className="w-3.5 h-3.5" /> Seu link de indicação</p>
                      <div className="flex gap-2">
                        <input
                          readOnly
                          value={link}
                          className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 font-mono"
                          onFocus={(e) => e.currentTarget.select()}
                        />
                        <Button variant="outline" onClick={() => copy(link, `link-${aff.code}`)} className="px-3">
                          {copied === `link-${aff.code}` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Compartilhe este link ou divulgue o código <strong>{aff.code}</strong>. Quem comprar usando ele
                        ganha {aff.discountPercent}% de desconto, e você recebe {aff.commissionPercent}% do valor líquido.
                      </p>
                    </div>

                    {/* Gerador de link de um produto específico */}
                    <div className="border-t border-border pt-5">
                      <p className="text-xs uppercase font-bold text-muted-foreground mb-2 flex items-center gap-1">
                        <Link2 className="w-3.5 h-3.5" /> Link de um produto específico
                      </p>
                      <select
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background mb-2"
                      >
                        <option value="">Escolha um produto para gerar o link...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {selectedProductId && (
                        <div className="flex gap-2">
                          <input
                            readOnly
                            value={`${SITE_URL}/produto/${selectedProductId}?ref=${aff.code}`}
                            className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 font-mono"
                            onFocus={(e) => e.currentTarget.select()}
                          />
                          <Button
                            variant="outline"
                            onClick={() => copy(`${SITE_URL}/produto/${selectedProductId}?ref=${aff.code}`, `prod-${aff.code}`)}
                            className="px-3"
                          >
                            {copied === `prod-${aff.code}` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Gere o link de qualquer produto. Quem abrir já entra com o seu código aplicado e vai direto pro produto.
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Modal Metas do Afiliado */}
      {showTierModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowTierModal(false)}>
          <div className="bg-card rounded-2xl w-full max-w-lg shadow-2xl border border-border overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-yellow-400 p-5 text-white relative">
              <button onClick={() => setShowTierModal(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <Trophy className="w-7 h-7" />
                <div>
                  <h2 className="font-bold text-xl">Sistema de Metas</h2>
                  <p className="text-yellow-100 text-sm">Venda mais e aumente sua comissão</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">


              {/* Como funciona */}
              <div className="bg-secondary/40 rounded-xl p-4 text-sm space-y-2">
                <p className="font-semibold text-base">Como funciona?</p>
                <p className="text-muted-foreground">Sua comissão aumenta conforme você vende mais a cada mês. Existem 3 níveis:</p>
                <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                  <li>No início você está no nível <strong>Bronze</strong> com <strong>10%</strong> de comissão</li>
                  <li>Menos de <strong>¥200.000</strong> → 🥉 <strong>Bronze (10%)</strong>, seja qual for o nível</li>
                  <li>Entre <strong>¥200.000 e ¥499.999</strong> → 🥈 <strong>Prata (15%)</strong></li>
                  <li><strong>¥500.000 ou mais</strong> → 🥇 <strong>Ouro (20%)</strong> direto, mesmo que esteja no Bronze</li>
                </ul>
              </div>

              {/* Tabela de níveis */}
              <div className="space-y-3">
                <p className="font-semibold text-sm">Níveis e metas:</p>
                {(Object.entries(TIER_CONFIG) as [AffiliateTier, typeof TIER_CONFIG[AffiliateTier]][]).map(([key, cfg]) => (
                  <div key={key} className={`rounded-xl border-2 p-4 ${
                    key === 'gold'   ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20' :
                    key === 'silver' ? 'border-gray-300 bg-gray-50 dark:bg-gray-900/30' :
                                       'border-pink-200 bg-pink-50 dark:bg-pink-950/20'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{cfg.emoji}</span>
                        <div>
                          <p className="font-bold">{cfg.label}</p>
                          <p className="text-xs text-muted-foreground">Comissão: <strong>{cfg.commissionPercent}%</strong> de cada venda</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Meta mensal</p>
                        <p className="font-bold text-lg">¥{cfg.goalYen.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {key === 'bronze' && <>
                        <p>✅ ¥200k–¥499k → sobe para 🥈 <strong>Prata (15%)</strong></p>
                        <p>✅ ¥500k ou mais → sobe direto para 🥇 <strong>Ouro (20%)</strong></p>
                        <p>🥉 Nível inicial — não cai abaixo daqui.</p>
                      </>}
                      {key === 'silver' && <>
                        <p>✅ ¥500k ou mais → sobe para 🥇 <strong>Ouro (20%)</strong></p>
                        <p>❌ ¥200k–¥499k → mantém 🥈 <strong>Prata (15%)</strong></p>
                        <p>⚠️ Menos de ¥200k → cai para 🥉 <strong>Bronze (10%)</strong></p>
                      </>}
                      {key === 'gold' && <>
                        <p>✅ ¥500k ou mais → mantém 🥇 <strong>Ouro (20%)</strong></p>
                        <p>❌ ¥200k–¥499k → cai para 🥈 <strong>Prata (15%)</strong></p>
                        <p>⚠️ Menos de ¥200k → cai direto para 🥉 <strong>Bronze (10%)</strong></p>
                      </>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Exemplo prático */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm space-y-1">
                <p className="font-semibold">Exemplo prático:</p>
                <p className="text-muted-foreground">🥉 Bronze + <strong>¥250.000</strong> em vendas → 🥈 <strong>Prata (15%)</strong> no mês seguinte.</p>
                <p className="text-muted-foreground">🥉 Bronze + <strong>¥550.000</strong> em vendas → 🥇 <strong>Ouro (20%) direto</strong> no mês seguinte.</p>
                <p className="text-muted-foreground">🥇 Ouro + <strong>¥350.000</strong> em vendas → 🥈 <strong>Prata (15%)</strong> no mês seguinte.</p>
                <p className="text-muted-foreground">🥇 Ouro + <strong>¥150.000</strong> em vendas → 🥉 <strong>Bronze (10%) direto</strong> no mês seguinte.</p>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                A comissão é calculada sobre o valor líquido de cada venda e liberada após confirmação de entrega.
              </p>

            </div>

            <div className="p-4 border-t border-border">
              <Button onClick={() => setShowTierModal(false)} className="w-full btn-primary">Entendido!</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default AffiliatePage;
