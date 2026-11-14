import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

export interface CarouselSlide {
  id: string;
  image?: string;
  videoSrc?: string;
  badge?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaLink: string;
  secondaryCtaLabel?: string;
  secondaryCtaLink?: string;
  priceOriginal?: string;
  pricePromo?: string;
  /** 'split' = produto ou promoção em destaque. 'center' = cartão do produto marcado no admin.
   *  Mantido por compatibilidade: os dois usam a mesma composição texto | mídia. */
  layout?: 'split' | 'center';
}

interface HeroCarouselProps {
  slides: CarouselSlide[];
  autoplay?: boolean;
  autoplayInterval?: number;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Destaques da home. Os slides ficam empilhados na MESMA célula de grid —
 * a altura acompanha o maior slide, sem altura fixa (era 660px no celular).
 * Troca só por opacidade (200ms); autoplay pausa em hover/foco, para de vez
 * depois de qualquer interação e nem começa sob reduced-motion.
 */
const HeroCarousel: React.FC<HeroCarouselProps> = ({ slides, autoplay = true, autoplayInterval = 6000 }) => {
  const { t } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const goToNext = useCallback(() => setCurrentIndex((prev) => (prev + 1) % slides.length), [slides.length]);

  useEffect(() => {
    if (!autoplay || paused || userInteracted || slides.length <= 1 || reducedMotion()) return;
    const timer = window.setInterval(goToNext, autoplayInterval);
    return () => window.clearInterval(timer);
  }, [autoplay, autoplayInterval, goToNext, paused, userInteracted, slides.length]);

  useEffect(() => {
    if (currentIndex >= slides.length) setCurrentIndex(0);
  }, [slides.length, currentIndex]);

  if (slides.length === 0) return null;

  const goToSlide = (index: number) => { setUserInteracted(true); setCurrentIndex(index % slides.length); };
  const goToPrevious = () => { setUserInteracted(true); setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length); };
  const goToNextManual = () => { setUserInteracted(true); goToNext(); };

  const controlClass =
    'flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-border bg-card"
      role="region"
      aria-roledescription="carousel"
      aria-label={t('featured.badge')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
      onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const startX = touchStartX.current;
        const endX = event.changedTouches[0]?.clientX;
        if (startX !== null && endX !== undefined && Math.abs(endX - startX) > 48) {
          if (endX - startX > 0) goToPrevious();
          else goToNextManual();
        }
        touchStartX.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') goToPrevious();
        if (event.key === 'ArrowRight') goToNextManual();
      }}
    >
      <div className="grid">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          const TitleTag = index === 0 ? 'h1' : 'h2';
          return (
            <article
              key={slide.id}
              aria-hidden={!isActive}
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${slides.length}`}
              className={cn(
                '[grid-area:1/1] grid gap-6 p-6 transition-opacity duration-200 ease-out motion-reduce:transition-none sm:p-8 md:grid-cols-[1fr_minmax(0,0.9fr)] md:items-center md:gap-10 md:p-10 lg:p-12',
                isActive ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0',
              )}
            >
              <div className="flex min-w-0 flex-col">
                {slide.badge && (
                  <p className="mb-3 text-sm font-medium text-primary">{slide.badge}</p>
                )}
                <TitleTag className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground line-clamp-3 sm:text-4xl lg:text-5xl">
                  {slide.title}
                </TitleTag>
                {slide.subtitle && (
                  <p className="mt-3 max-w-prose text-base leading-relaxed text-muted-foreground line-clamp-3">{slide.subtitle}</p>
                )}
                {(slide.priceOriginal || slide.pricePromo) && (
                  <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {slide.pricePromo && <span className="text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">{slide.pricePromo}</span>}
                    {slide.priceOriginal && <span className="text-sm text-muted-foreground line-through tabular-nums">{slide.priceOriginal}</span>}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    to={slide.ctaLink}
                    tabIndex={isActive ? 0 : -1}
                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {slide.ctaLabel || t('hero.cta.story')}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  {slide.secondaryCtaLabel && slide.secondaryCtaLink && (
                    <Link
                      to={slide.secondaryCtaLink}
                      tabIndex={isActive ? 0 : -1}
                      className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {slide.secondaryCtaLabel}
                    </Link>
                  )}
                </div>
              </div>

              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 md:aspect-square md:max-h-[380px]">
                {isActive && slide.videoSrc && !reducedMotion() ? (
                  <video src={slide.videoSrc} autoPlay muted loop playsInline preload="metadata" poster={slide.image} className="h-full w-full object-contain" />
                ) : slide.image ? (
                  <img
                    src={slide.image}
                    alt={isActive ? slide.title : ''}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    className="h-full w-full object-contain p-4 sm:p-6"
                  />
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
          <div className="flex items-center gap-1" role="group" aria-label={t('hero.carousel.goto').replace('{n}', '')}>
            {slides.map((slide, index) => (
              <button
                type="button"
                key={slide.id}
                onClick={() => goToSlide(index)}
                className="group flex h-11 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('hero.carousel.goto').replace('{n}', String(index + 1))}
                aria-current={index === currentIndex ? 'true' : undefined}
              >
                <span className={cn('h-1.5 w-5 rounded-full transition-colors duration-150', index === currentIndex ? 'bg-primary' : 'bg-border group-hover:bg-muted-foreground/40')} />
              </button>
            ))}
            <span className="ml-2 text-xs tabular-nums text-muted-foreground" aria-hidden="true">{currentIndex + 1}/{slides.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={goToPrevious} className={controlClass} aria-label={t('hero.carousel.prev')} title={t('hero.carousel.prev')}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={goToNextManual} className={controlClass} aria-label={t('hero.carousel.next')} title={t('hero.carousel.next')}>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeroCarousel;
