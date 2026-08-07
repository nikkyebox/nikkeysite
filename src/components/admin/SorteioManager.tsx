import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Zap, AlertTriangle, Eye, EyeOff, ChevronDown, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useProducts } from '@/context/ProductsContext';
import { raffleService, Raffle, RafflePrize, RaffleParticipant, RaffleAdminWinner, MAX_RAFFLE_PRIZES } from '@/services/raffleService';
import { ensureAdminAuth } from '@/utils/adminAuth';
import { requireAdminPassword } from '@/utils/adminGuard';

const SorteioManager: React.FC = () => {
  const { toast } = useToast();
  const { products: allProducts, loading: productsLoading } = useProducts();
  const products = allProducts.filter((p) => !p.hidden);

  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);

  // Estado local para edição
  const [rules, setRules] = useState('');
  const [prizeCount, setPrizeCount] = useState(3);
  const [prizes, setPrizes] = useState<RafflePrize[]>([]);
  const [participants, setParticipants] = useState<RaffleParticipant[]>([]);
  const [drawResult, setDrawResult] = useState<RaffleAdminWinner[] | null>(null);

  // Carrega dados iniciais
  useEffect(() => {
    const unsub = raffleService.subscribe(
      (r) => {
        setRaffle(r);
        setRules(r.rules);
        setPrizeCount(r.prizeCount);
        setPrizes(r.prizes);
        if (r.winners.length === 0) setDrawResult(null);
        setLoadError(null);
        setLoading(false);
      },
      (err) => {
        // Sair do "carregando" no erro é o que impede a tela de ficar presa.
        setLoading(false);
        setLoadError(
          err instanceof Error && /permission|insufficient/i.test(err.message)
            ? 'Sem permissão para ler o sorteio. As regras do Firestore precisam ser publicadas (a coleção `raffles` é nova).'
            : 'Não foi possível carregar o sorteio. Verifique a conexão e tente de novo.'
        );
      }
    );
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Carrega participantes quando abre
  const loadParticipants = async () => {
    const ps = await raffleService.listParticipants();
    setParticipants(ps);
  };

  useEffect(() => {
    loadParticipants();
    raffleService.getAdminWinners()
      .then((winners) => setDrawResult(winners.length > 0 ? winners : null))
      .catch(() => undefined);
  }, []);

  // Função: salvar regras
  const handleSaveRules = async () => {
    if (!(await requireAdminPassword('atualizar regras do sorteio'))) return;
    setSaving(true);
    try {
      await ensureAdminAuth();
      await raffleService.saveConfig({ rules });
      toast({ title: '✅ Regras salvas', description: 'As regras do sorteio foram atualizadas.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Função: atualizar contagem de prêmios
  const handleUpdatePrizeCount = (newCount: number) => {
    const count = Math.min(MAX_RAFFLE_PRIZES, Math.max(1, Math.floor(newCount) || 1));
    setPrizeCount(count);
    const newPrizes = prizes.slice(0, count);
    // Preencher posições faltantes
    for (let i = newPrizes.length; i < count; i++) {
      newPrizes.push({
        rank: i + 1,
        type: 'product',
      });
    }
    setPrizes(newPrizes);
  };

  // Função: atualizar um prêmio
  const handleUpdatePrize = (rank: number, updates: Partial<RafflePrize>) => {
    const updated = prizes.map((p) =>
      p.rank === rank ? { ...p, ...updates } : p
    );
    setPrizes(updated);
  };

  // Função: remover prêmio (reduzir contagem)
  const handleRemovePrize = (rank: number) => {
    const newCount = Math.max(1, prizeCount - 1);
    handleUpdatePrizeCount(newCount);
  };

  // Função: salvar prêmios
  const handleSavePrizes = async () => {
    if (drawResult?.length) {
      toast({ title: 'Sorteio já realizado', description: 'Inicie um novo sorteio antes de alterar os prêmios.', variant: 'destructive' });
      return;
    }
    if (!(await requireAdminPassword('atualizar prêmios do sorteio'))) return;
    // Valida que cada prêmio tem um tipo e valor
    for (const prize of prizes) {
      if (prize.type === 'product' && !prize.productId) {
        toast({ title: 'Erro', description: `Rank ${prize.rank}: selecione um produto`, variant: 'destructive' });
        return;
      }
      if (prize.type === 'points' && !prize.points) {
        toast({ title: 'Erro', description: `Rank ${prize.rank}: insira um valor em pontos`, variant: 'destructive' });
        return;
      }
    }
    setSaving(true);
    try {
      await ensureAdminAuth();
      await raffleService.saveConfig({ prizeCount, prizes });
      toast({ title: '✅ Prêmios salvos', description: 'A configuração de prêmios foi atualizada.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Função: realizar sorteio
  const handleDraw = async () => {
    if (drawResult?.length) {
      toast({ title: 'Sorteio já realizado', description: 'Use “Iniciar novo sorteio” para não premiar a mesma rodada duas vezes.', variant: 'destructive' });
      return;
    }
    if (!(await requireAdminPassword('realizar sorteio'))) return;
    if (prizes.length === 0) {
      toast({ title: 'Erro', description: 'Configure pelo menos um prêmio primeiro', variant: 'destructive' });
      return;
    }
    if (participants.length === 0) {
      toast({ title: 'Erro', description: 'Nenhum participante cadastrado', variant: 'destructive' });
      return;
    }
    setDrawing(true);
    try {
      await ensureAdminAuth();
      const winners = await raffleService.draw(prizes, participants);
      setDrawResult(winners);
      await loadParticipants(); // Recarrega para mostrar status
      toast({ title: '✅ Sorteio realizado', description: `${winners.length} vencedor(es) selecionado(s)` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({ title: 'Erro ao sortear', description: message, variant: 'destructive' });
    } finally {
      setDrawing(false);
    }
  };
  const handleResetDraw = async () => {
    if (!(await requireAdminPassword('iniciar novo sorteio'))) return;
    setDrawing(true);
    try {
      await raffleService.resetDraw();
      setDrawResult(null);
      toast({ title: 'Novo sorteio iniciado', description: 'Os prêmios anteriores continuam entregues; esta rodada está pronta para nova configuração.' });
    } catch (error: unknown) {
      toast({
        title: 'Erro ao iniciar novo sorteio',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setDrawing(false);
    }
  };


  // Função: publicar/despublicar
  const handleTogglePublish = async () => {
    if (!(await requireAdminPassword(`${raffle?.published ? 'despublicar' : 'publicar'} sorteio`))) return;
    try {
      await ensureAdminAuth();
      await raffleService.publish(!raffle?.published);
      toast({
        title: '✅ Status atualizado',
        description: `Sorteio ${raffle?.published ? 'despublicado' : 'publicado'}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Carregando sorteio...</p>;
  }

  if (loadError) {
    return (
      <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-5">
        <p className="flex items-center gap-2 font-semibold text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Não foi possível abrir o sorteio
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Publique as regras com <code className="font-mono">firebase deploy --only firestore:rules</code>.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  // Aviso: vencedores que não seguem
  const nonFollowers = drawResult?.filter((w) => !w.followsInstagram || !w.followsTiktok) || [];

  return (
    <div className="space-y-6">
      <Tabs defaultValue="regras" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="sorteio">Sorteio</TabsTrigger>
        </TabsList>

        {/* Aba: Regras */}
        <TabsContent value="regras" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Regras do Sorteio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="rules">Texto das regras</Label>
                <Textarea
                  id="rules"
                  placeholder="Descreva as regras do sorteio aqui... (quebras de linha serão preservadas)"
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  className="min-h-48"
                />
              </div>
              <Button onClick={handleSaveRules} disabled={saving}>
                {saving ? 'Salvando...' : '✅ Salvar Regras'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba: Sorteio */}
        <TabsContent value="sorteio" className="space-y-4">
          {/* Configuração de Prêmios */}
          <Card>
            <CardHeader>
              <CardTitle>Prêmios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Contagem de prêmios */}
              <div className="space-y-2">
                <Label htmlFor="prizecount">Número de prêmios/ganhadores</Label>
                <div className="flex gap-2">
                  <Input
                    id="prizecount"
                    type="number"
                    min="1"
                    max={MAX_RAFFLE_PRIZES}
                    value={prizeCount}
                    onChange={(e) => handleUpdatePrizeCount(Math.max(1, Number(e.target.value)))}
                    className="w-24"
                  />
                  <p className="text-sm text-muted-foreground flex items-center">
                    {prizeCount} {prizeCount === 1 ? 'posição' : 'posições'} no pódio
                  </p>
                </div>
              </div>

              {/* Lista de prêmios */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {prizes.map((prize, idx) => (
                  <div key={prize.rank} className="p-4 bg-secondary/20 rounded-lg border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">
                        {prize.rank === 1 ? '🥇' : prize.rank === 2 ? '🥈' : prize.rank === 3 ? '🥉' : '📍'} Posição {prize.rank}
                      </h4>
                      {prize.rank > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleRemovePrize(prize.rank)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Tipo de prêmio */}
                      <div>
                        <Label className="text-xs">Tipo</Label>
                        <select
                          value={prize.type}
                          onChange={(e) =>
                            handleUpdatePrize(prize.rank, { type: e.target.value as 'product' | 'points' })
                          }
                          className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
                        >
                          <option value="product">Produto</option>
                          <option value="points">Pontos</option>
                        </select>
                      </div>

                      {/* Valor do prêmio */}
                      {prize.type === 'product' ? (
                        <div>
                          <Label className="text-xs">Produto</Label>
                          <select
                            value={prize.productId || ''}
                            onChange={(e) => {
                              const prod = products.find((p) => p.id === e.target.value);
                              handleUpdatePrize(prize.rank, {
                                productId: prod?.id,
                                productName: prod?.name,
                                productImage: prod?.thumbnail || prod?.image,
                                productUrl: `/produto/${prod?.id}`,
                              });
                            }}
                            disabled={productsLoading}
                            className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
                          >
                            <option value="">— Selecionar —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs">Pontos</Label>
                          <Input
                            type="number"
                            min="1"
                            value={prize.points || 1000}
                            onChange={(e) => handleUpdatePrize(prize.rank, { points: Number(e.target.value) })}
                            className="h-9"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={handleSavePrizes} disabled={saving} className="w-full">
                {saving ? 'Salvando...' : '✅ Salvar Prêmios'}
              </Button>
            </CardContent>
          </Card>

          {/* Participantes */}
          <Card>
            <CardHeader>
              <CardTitle>Participantes ({participants.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {participants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum participante cadastrado</p>
                ) : (
                  participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        {p.followsInstagram && <Badge variant="outline" className="text-pink-600">IG</Badge>}
                        {p.followsTiktok && <Badge variant="outline" className="text-gray-700">TT</Badge>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Botão de Sorteio */}
          <Card className="bg-primary/5 border-primary/30">
            <CardContent className="pt-6">
              {drawResult?.length ? (
                <Button onClick={handleResetDraw} disabled={drawing} size="lg" variant="outline" className="w-full">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {drawing ? 'Preparando...' : 'Iniciar novo sorteio'}
                </Button>
              ) : (
                <Button
                  onClick={handleDraw}
                  disabled={drawing || prizes.length === 0 || participants.length === 0}
                  size="lg"
                  className="w-full"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {drawing ? 'Sorteando...' : '⚡ Realizar Sorteio'}
                </Button>
              )}
              {prizes.length === 0 && <p className="text-xs text-muted-foreground mt-2">Configure prêmios primeiro</p>}
              {participants.length === 0 && <p className="text-xs text-muted-foreground mt-2">Registre participantes na loja</p>}
            </CardContent>
          </Card>

          {/* Resultado do Sorteio */}
          {drawResult && drawResult.length > 0 && (
            <>
              <Card className="bg-green-50 border-green-300">
                <CardHeader>
                  <CardTitle className="text-green-900">✅ Sorteio Realizado</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {drawResult.map((w) => (
                      <div key={`${w.rank}-${w.userId}`} className="flex items-center justify-between">
                        <span>
                          {w.rank === 1 ? '🥇' : w.rank === 2 ? '🥈' : w.rank === 3 ? '🥉' : '📍'} {w.userName}
                        </span>
                        <span className="text-muted-foreground">{w.userEmail}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Aviso: não segue */}
              {nonFollowers.length > 0 && (
                <Alert className="border-amber-300 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    <p className="font-semibold mb-2">⚠️ Vencedores que não seguem as redes:</p>
                    <ul className="space-y-1 text-sm">
                      {nonFollowers.map((w) => (
                        <li key={`${w.rank}-${w.userId}`}>
                          <strong>{w.userName}</strong>: não segue{' '}
                          {!w.followsInstagram && 'Instagram'}
                          {!w.followsInstagram && !w.followsTiktok ? ', ' : ''}
                          {!w.followsTiktok && 'TikTok'}
                          {' — não recebe o prêmio e não será publicado'}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {/* Botão: Publicar */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold">Publicar Sorteio</h4>
                  <p className="text-sm text-muted-foreground">
                    Vencedores e regras {raffle?.published ? 'são visíveis' : 'ficam ocultos'} para o público
                  </p>
                </div>
                <Button
                  onClick={handleTogglePublish}
                  variant={raffle?.published ? 'destructive' : 'default'}
                  className="flex items-center gap-2"
                >
                  {raffle?.published ? (
                    <>
                      <EyeOff className="w-4 h-4" />
                      Despublicar
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      Publicar
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SorteioManager;
