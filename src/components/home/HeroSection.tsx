import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Sparkles, PlaneTakeoff, Users, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/LanguageContext';
import { db } from '@/config/firebase';
import { doc, getDoc, collection, getCountFromServer } from 'firebase/firestore';
import { cdnImage } from '@/services/cloudinaryService';

interface ActivePromo { type: string; productId: string; productName: string; productImage: string; }

const PROMO_LABELS: Record<string, string> = {
  abertura: 'Promoção de Abertura',
  mes: 'Promoção do Mês',
  lancamento: 'Promoção de Lançamento',
  temporada: 'Promoção de Temporada',
  relampago: 'Promoção Relâmpago',
  especial: 'Promoção Especial',
  exclusiva: 'Exclusiva Online',
  frete: 'Frete Grátis',
};

// Ativa o contador de prova social somente quando há 100+ entregas reais.
// Antes disso, o bloco fica oculto para não exibir números falsos.
const MIN_ORDERS_TO_SHOW = 100;

interface SocialProof { avgRating?: number; }

const HeroSection: React.FC = () => {
  const { t } = useLanguage();
  const [promo, setPromo] = useState<ActivePromo | null | undefined>(undefined);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [avgRating, setAvgRating] = useState<number>(5);

  useEffect(() => {
    if (!db) { setPromo(null); return; }
    getDoc(doc(db, 'siteContent', 'homePromotion'))
      .then((snap) => setPromo(snap.exists() ? (snap.data() as ActivePromo) : null))
      .catch(() => setPromo(null));
    // Contagem real de pedidos (aggregation — sem baixar documentos)
    getCountFromServer(collection(db, 'orders'))
      .then((snap) => setOrderCount(snap.data().count))
      .catch(() => setOrderCount(0));
    // Nota média configurada pelo admin em siteContent/socialProof
    getDoc(doc(db, 'siteContent', 'socialProof'))
      .then((snap) => { if (snap.exists()) setAvgRating((snap.data() as SocialProof).avgRating ?? 5); })
      .catch(() => {});
  }, []);

  // Só exibe quando há 100+ pedidos reais confirmados
  const showCounter = orderCount !== null && orderCount >= MIN_ORDERS_TO_SHOW;

  return (
    <section className="relative min-h-[85vh] bg-gradient-to-b from-purple-100 via-purple-50/60 to-white overflow-hidden pt-12">
      {/* Background Decorative Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-purple-200/50 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-40 w-[600px] h-[600px] bg-purple-100/60 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-12 md:py-20 relative z-10">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Commercial Pitch */}
          <div className="space-y-6 lg:col-span-7 animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-100 text-purple-600 border border-purple-200 text-xs md:text-sm font-extrabold">
              <span className="w-2.5 h-2.5 bg-purple-600 rounded-full animate-ping" />
              {t('hero.badge')}
            </div>
            
            <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-black leading-tight text-gray-900">
              {t('hero.title.1')}{' '}
              <span className="text-purple-500 font-extrabold relative inline-block">
                {t('hero.title.highlight')}
                <span className="absolute left-0 bottom-1 w-full h-2 bg-yellow-400 -z-10 rounded" />
              </span>{' '}
              {t('hero.title.2')}
            </h1>
            
            <p className="text-base md:text-lg text-gray-600 max-w-xl leading-relaxed">
              {t('hero.description')}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button asChild size="lg" className="bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl px-8 text-base shadow-md transition-all duration-300 hover:shadow-lg active:scale-95">
                <Link to="/produtos">
                  {t('hero.cta.products')}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl px-8 text-base border-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-bold">
                <Link to="/ofertas">
                  {t('nav.offers')}
                </Link>
              </Button>
            </div>

            {/* Contador de prova social — só aparece após 100 entregas reais */}
            {showCounter && (
              <div className="pt-6 border-t border-gray-100">
                <div className="flex items-center gap-4 bg-gradient-to-r from-orange-50 to-purple-50 border border-purple-100 rounded-2xl px-5 py-4">
                  <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center shrink-0 shadow-md">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-3xl md:text-4xl font-black text-gray-900 leading-none">
                      {orderCount}+
                      <span className="text-purple-500 text-lg ml-1">✓</span>
                    </p>
                    <p className="text-sm font-bold text-gray-600 mt-0.5">entregas realizadas no Brasil</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-0.5 justify-end">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(avgRating) ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`} />
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 font-semibold mt-0.5">{avgRating.toFixed(1)} avaliação média</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Visual Banner */}
          <div className="lg:col-span-5 relative animate-fade-in">
            <Link to={promo ? '/promocao' : '#'} className={`relative aspect-[4/3] rounded-3xl overflow-hidden shadow-elevated border-4 border-white bg-gray-100 block ${promo ? 'cursor-pointer' : 'cursor-default'}`}>
              {promo?.productImage ? (
                <img
                  src={cdnImage(promo.productImage, 1200)}
                  alt={promo.productName}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <img src="https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?q=100&w=1200&auto=format&fit=crop" alt="Japanese Shopping District" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              {promo && (
                <div className="absolute inset-0 flex items-end justify-center pb-5 opacity-0 hover:opacity-100 transition-opacity">
                  <span className="bg-white/90 text-gray-900 text-xs font-bold px-4 py-2 rounded-full shadow">Ver promoção →</span>
                </div>
              )}
            </Link>

            {/* Trust badge 1: Remessa Conforme */}
            <div className="absolute -top-4 -left-4 bg-white rounded-2xl shadow-card p-3 border border-gray-100 animate-float">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-extrabold text-[10px] text-green-600 uppercase tracking-wider">Remessa Conforme</p>
                  <p className="text-xs font-bold text-gray-800">Isento de Taxas &lt; $50</p>
                </div>
              </div>
            </div>

            {/* Trust badge 2: Tokyo flight */}
            <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-card p-3.5 border border-gray-100 animate-float" style={{ animationDelay: '2s' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-500">
                  <PlaneTakeoff className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <p className="font-extrabold text-[10px] text-purple-500 uppercase tracking-wider">{t('hero.badge.recipe')}</p>
                  <p className="text-xs font-bold text-gray-800">{t('hero.badge.tradition')}</p>
                </div>
              </div>
            </div>
            
            {/* Banner de promoção dinâmico (configurado no painel admin) */}
            {promo && (
              <Link
                to="/promocao"
                className="absolute top-4 right-4 flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 transition-colors text-gray-900 text-[10px] font-black uppercase px-2.5 py-1.5 rounded shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 animate-spin shrink-0" style={{ animationDuration: '3s' }} />
                {PROMO_LABELS[promo.type] ?? promo.type}
              </Link>
            )}
          </div>

        </div>
      </div>
    </section>
  );
};

export default HeroSection;
