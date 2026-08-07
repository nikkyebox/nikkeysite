import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { raffleService, Raffle } from '@/services/raffleService';
import { Link } from 'react-router-dom';

const PODIUM_GIFS: Record<number, string> = {
  1: '/raffle/trofeu-ouro.gif',
  2: '/raffle/trofeu-prata.gif',
  3: '/raffle/trofeu-bronze.gif',
};

const Sorteio: React.FC = () => {
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;
    const unsub = raffleService.subscribe((value) => {
      settled = true;
      setRaffle(value);
      setLoading(false);
    });
    const timeout = setTimeout(async () => {
      if (settled) return;
      const value = await raffleService.getRaffle();
      setRaffle(value);
      setLoading(false);
    }, 2000);
    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Carregando sorteio...</p>
        </div>
      </Layout>
    );
  }

  if (!raffle) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Erro ao carregar sorteio</p>
        </div>
      </Layout>
    );
  }

  const hasWinners = raffle.winners && raffle.winners.length > 0 && raffle.published;

  // Ordena vencedores por rank
  const sortedWinners = hasWinners
    ? [...raffle.winners].sort((a, b) => a.rank - b.rank)
    : [];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-4xl font-bold text-center mb-2">Sorteio NikkeyBox</h1>
        <p className="text-center text-muted-foreground mb-8">
          Confira os ganhadores e as regras da nossa promoção
        </p>

        <Tabs defaultValue="sorteio" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="sorteio" className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Sorteio
            </TabsTrigger>
            <TabsTrigger value="regras">Regras</TabsTrigger>
          </TabsList>

          {/* Aba: Sorteio (Vencedores) */}
          <TabsContent value="sorteio" className="space-y-6">
            {!hasWinners ? (
              <div className="text-center py-12 bg-secondary/20 rounded-2xl border border-border">
                <Trophy className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-semibold text-foreground mb-2">
                  Sorteio em breve!
                </p>
                <p className="text-muted-foreground">
                  Em breve anunciaremos os ganhadores desta promoção. Fique atento!
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {sortedWinners.map((winner) => {
                  const prize = raffle.prizes.find((p) => p.rank === winner.rank);
                  const trophyGif = PODIUM_GIFS[winner.rank];

                  // Estilos para os três primeiros (ouro, prata, bronze)
                  let cardBg = '';
                  if (winner.rank === 1) cardBg = 'bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-yellow-300';
                  else if (winner.rank === 2) cardBg = 'bg-gradient-to-br from-gray-50 to-gray-100/50 border-gray-300';
                  else if (winner.rank === 3) cardBg = 'bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-300';
                  else cardBg = 'bg-card';

                  return (
                    <Card key={winner.rank} className={cardBg + ' border-2'}>
                      <CardContent className="p-6">
                        <div className="grid grid-cols-[auto_1fr] gap-6 items-center">
                          {/* Medalha animada */}
                          <div className="flex flex-col items-center">
                            {trophyGif ? (
                              <img
                                src={trophyGif}
                                alt={`Troféu do ${winner.rank}º lugar`}
                                className="h-24 w-24 object-contain"
                              />
                            ) : (
                              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-3xl font-black text-primary">
                                #{winner.rank}
                              </div>
                            )}
                            <p className="text-sm font-semibold text-muted-foreground mt-1">
                              {winner.rank}º lugar
                            </p>
                          </div>

                          {/* Info do vencedor e prêmio */}
                          <div>
                            <h3 className="text-2xl font-bold text-foreground mb-1">
                              {winner.userName}
                            </h3>

                            {/* Prêmio */}
                            {prize && (
                              <div className="mt-4">
                                {prize.type === 'product' && prize.productId ? (
                                  <Link
                                    to={prize.productUrl || `/produto/${prize.productId}`}
                                    className="block hover:opacity-80 transition"
                                  >
                                    <div className="flex items-center gap-4 p-3 bg-white/50 rounded-lg border border-border">
                                      {prize.productImage && (
                                        <img
                                          src={prize.productImage}
                                          alt={prize.productName}
                                          className="w-20 h-20 object-cover rounded-lg"
                                        />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-muted-foreground">Prêmio:</p>
                                        <p className="font-semibold text-foreground truncate">
                                          {prize.productName}
                                        </p>
                                        <p className="text-xs text-primary mt-1">Ver produto →</p>
                                      </div>
                                    </div>
                                  </Link>
                                ) : prize.type === 'points' ? (
                                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                    <p className="text-sm text-muted-foreground">Prêmio:</p>
                                    <p className="text-2xl font-bold text-purple-700">
                                      {prize.points} pontos
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Aba: Regras */}
          <TabsContent value="regras" className="space-y-4">
            {raffle.rules ? (
              <Card className="bg-secondary/10 border-border">
                <CardContent className="p-6">
                  <p className="whitespace-pre-wrap text-foreground leading-relaxed">
                    {raffle.rules}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-12 bg-secondary/20 rounded-2xl border border-border">
                <p className="text-muted-foreground">
                  Regras ainda não foram publicadas. Volte em breve!
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Sorteio;
