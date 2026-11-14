import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Hero da home: vídeo de abertura (toca uma vez) com o CTA para a loja.
 *
 * Altura limitada (≤ 70% da tela): antes ocupava 100dvh e o cliente não via
 * nenhum produto sem rolar. Agora a vitrine aparece já na primeira dobra.
 * Com reduced-motion o vídeo não toca sozinho — fica o pôster.
 */
const Hero: React.FC = () => {
  const { t } = useLanguage();
  const [autoPlay, setAutoPlay] = useState(false);
  useEffect(() => { setAutoPlay(!prefersReducedMotion()); }, []);

  return (
    <section
      className="relative h-[min(70svh,600px)] min-h-[420px] w-full overflow-hidden bg-foreground"
      aria-label={t('cinematicHero.ariaLabel')}
    >
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src="/videos/hero-store-transition.mp4"
        poster="/videos/hero-intro-poster.jpg"
        autoPlay={autoPlay}
        muted
        playsInline
        preload={autoPlay ? 'auto' : 'none'}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/0 via-black/20 to-black/60" />

      <div className="absolute inset-x-0 bottom-8 z-10 flex justify-center px-4">
        <Link
          to="/produtos"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {t('cinematicHero.outro.cta.products')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
};

export default Hero;
