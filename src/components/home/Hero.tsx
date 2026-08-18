import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { getLenis } from '@/lib/smoothScroll';
import HeroFramedSlogan from './HeroFramedSlogan';

/**
 * Hero simples: um único vídeo de fundo, tocado uma vez (sem loop, sem
 * carrossel/pin de produtos). Ocupa a tela cheia e, ao rolar, o resto da
 * página aparece normalmente (sem scroll-jacking) — substitui o antigo
 * CinematicHeroShelf, que continua no repositório (não usado) caso queira
 * voltar a ele depois.
 */
const Hero: React.FC = () => {
  const { t } = useLanguage();
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.fromTo(
        '.hero-reveal',
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.9, stagger: 0.12, ease: 'power2.out', delay: 0.2 },
      );
    },
    { scope: sectionRef },
  );

  const scrollToNext = () => {
    const section = sectionRef.current;
    if (!section) return;
    const target = section.offsetTop + section.offsetHeight;
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(target, { duration: 1.1 });
    else window.scrollTo({ top: target, behavior: 'smooth' });
  };

  return (
    <section
      ref={sectionRef}
      className="relative h-[100dvh] w-full overflow-hidden bg-background"
      aria-label={t('cinematicHero.ariaLabel')}
    >
      {/* Reprodução única: sem `loop`, o vídeo congela no último quadro. */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src="/videos/hero-store-transition.mp4"
        poster="/videos/hero-intro-poster.jpg"
        autoPlay
        muted
        playsInline
        preload="auto"
        aria-hidden
      />
      {/* Escurece o vídeo para o texto branco ficar legível, independente do
          tema da página (claro ou escuro) — e funde suavemente com a cor de
          fundo só na borda inferior, para a transição de scroll ficar limpa. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/35 to-black/65" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />

      {/* Slogan emoldurando o círculo do logo — cada palavra presa a uma
          borda da tela, nunca esbarra no círculo. Substitui o antigo título +
          descrição por inteiro (era "Beleza Japonesa" + "Cosméticos
          japoneses selecionados e enviados com segurança..."). Só aparece
          depois que a animação do círculo do vídeo termina de se formar. */}
      <HeroFramedSlogan className="z-10" />

      {/* CTA e dica de scroll ficam juntos perto do rodapé da tela — fora do
          centro, que é onde o círculo do logo está, para não cobrir a logo. */}
      <div className="absolute inset-x-0 bottom-8 z-10 flex flex-col items-center gap-4 px-4 text-center">
        <Link
          to="/produtos"
          className="hero-reveal inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t('cinematicHero.outro.cta.products')} <ArrowRight className="h-4 w-4" />
        </Link>

        <button
          type="button"
          onClick={scrollToNext}
          className="hero-reveal flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/70 transition-opacity hover:opacity-100"
        >
          <ArrowDown className="cinematic-bob h-3 w-3" />
          <span>{t('cinematicHero.intro.scroll')}</span>
        </button>
      </div>
    </section>
  );
};

export default Hero;
