import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight, PlaneTakeoff, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  titleParts?: {
    before: string;
    highlight: string;
    after: string;
  };
  highlights?: string[];
  priceOriginal?: string;
  pricePromo?: string;
  /** 'split' = produto/promoção em destaque.
   *  'center' = apresentação institucional imersiva. */
  layout?: 'split' | 'center';
}

interface HeroCarouselProps {
  slides: CarouselSlide[];
  autoplay?: boolean;
  autoplayInterval?: number;
}

const HeroCarousel: React.FC<HeroCarouselProps> = ({
  slides,
  autoplay = true,
  autoplayInterval = 5000,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  // Uma vez que o usuário navega manualmente, o autoplay desliga definitivamente
  // (vira manual) — só volta a tocar se a página for recarregada.
  const [userInteracted, setUserInteracted] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);
  useEffect(() => {
    if (!autoplay || isHovering || userInteracted || slides.length <= 1) return;
    const timer = window.setInterval(goToNext, autoplayInterval);
    return () => window.clearInterval(timer);
  }, [autoplay, autoplayInterval, goToNext, isHovering, userInteracted, slides.length]);

  // Evita índice fora do range quando o número de slides muda (ex: promo some)
  useEffect(() => {
    if (currentIndex >= slides.length) setCurrentIndex(0);
  }, [slides.length, currentIndex]);

  if (slides.length === 0) return null;

  const goToSlide = (index: number) => {
    setUserInteracted(true);
    setCurrentIndex(index % slides.length);
  };
  const goToPrevious = () => {
    setUserInteracted(true);
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };
  const goToNextManual = () => {
    setUserInteracted(true);
    goToNext();
  };
  const highlightIcons = [Sparkles, ShieldCheck, PlaneTakeoff];



  return (
    <div
      className="hero-future group/hero relative isolate w-full overflow-hidden rounded-[2rem] border border-purple-100/80 bg-white h-[660px] sm:h-[680px] lg:h-[520px] xl:h-[560px] shadow-elevated"
      role="region"
      aria-roledescription="carousel"
      aria-label="NikkeyBox"
      tabIndex={0}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
        setIsHovering(true);
      }}
      onTouchEnd={(event) => {
        const startX = touchStartX.current;
        const endX = event.changedTouches[0]?.clientX;
        if (startX !== null && endX !== undefined) {
          const distance = endX - startX;
          if (Math.abs(distance) > 48) {
            setUserInteracted(true);
            distance > 0 ? goToPrevious() : goToNextManual();
          }
        }
        touchStartX.current = null;
        setIsHovering(false);
      }}
      onFocusCapture={() => setIsHovering(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsHovering(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') goToPrevious();
        if (event.key === 'ArrowRight') goToNextManual();
      }}
    >
      <div className="hero-grid absolute inset-0 pointer-events-none" aria-hidden="true" />
      <div className="hero-glow absolute -left-24 -top-28 h-72 w-72 rounded-full bg-purple-300/35 blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="hero-glow hero-glow-delayed absolute -bottom-36 right-0 h-96 w-96 rounded-full bg-violet-300/30 blur-3xl pointer-events-none" aria-hidden="true" />

      <div className="relative h-full w-full">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          const layout = slide.layout ?? 'split';
          const TitleTag = index === 0 ? 'h1' : 'h2';
          const titleContent = slide.titleParts ? (
            <>
              {slide.titleParts.before}{' '}
              <span className="hero-title-gradient">{slide.titleParts.highlight}</span>{' '}
              {slide.titleParts.after}
            </>
          ) : slide.title;

          return (
            <article
              key={slide.id}
              aria-hidden={!isActive}
              className={cn(
                'absolute inset-0 overflow-hidden rounded-[2rem] bg-white transition-all duration-700 ease-out',
                isActive
                  ? 'z-10 translate-x-0 scale-100 opacity-100'
                  : 'z-0 translate-x-6 scale-[0.985] opacity-0 pointer-events-none'
              )}
            >
              {layout === 'center' ? (
                <div className="relative z-[2] grid h-full grid-rows-[auto_1fr] gap-3 px-7 pb-16 pt-8 sm:px-10 sm:pb-16 sm:pt-10 lg:grid-cols-[1.08fr_.92fr] lg:grid-rows-1 lg:gap-8 lg:px-14 lg:py-12 xl:px-20">
                  <div className="relative z-10 flex min-w-0 flex-col justify-center">
                    {slide.badge && (
                      <span className="hero-glass mb-4 inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-purple-700 sm:text-xs">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-500 opacity-60" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-500" />
                        </span>
                        {slide.badge}
                      </span>
                    )}

                    <TitleTag className="max-w-3xl text-3xl font-black leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-5xl xl:text-6xl">
                      {titleContent}
                    </TitleTag>

                    {slide.subtitle && (
                      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base lg:text-lg lg:leading-relaxed line-clamp-3">
                        {slide.subtitle}
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Link
                        to={slide.ctaLink}
                        tabIndex={isActive ? 0 : -1}
                        className="hero-primary-cta inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-purple-500/25 transition-all duration-300 hover:-translate-y-1 hover:bg-purple-600 hover:shadow-xl hover:shadow-purple-500/30 active:translate-y-0"
                      >
                        {slide.ctaLabel || 'Saiba Mais'}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                      {slide.secondaryCtaLabel && slide.secondaryCtaLink && (
                        <Link
                          to={slide.secondaryCtaLink}
                          tabIndex={isActive ? 0 : -1}
                          className="hero-glass inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-extrabold text-slate-800 transition-all duration-300 hover:-translate-y-1 hover:border-purple-300 hover:text-purple-700"
                        >
                          {slide.secondaryCtaLabel}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      )}
                    </div>

                    {slide.highlights && slide.highlights.length > 0 && (
                      <div className="mt-5 hidden flex-wrap gap-2 sm:flex" aria-label="Diferenciais">
                        {slide.highlights.map((highlight, highlightIndex) => {
                          const HighlightIcon = highlightIcons[highlightIndex % highlightIcons.length];
                          return (
                            <span key={highlight} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-purple-500 shadow-sm ring-1 ring-purple-100">
                                <HighlightIcon className="h-3.5 w-3.5" />
                              </span>
                              {highlight}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="relative flex min-h-[245px] items-center justify-center sm:min-h-[285px] lg:min-h-0">
                    <div className="hero-orbit absolute h-[88%] max-h-[430px] aspect-square rounded-full border border-purple-300/50" aria-hidden="true" />
                    <div className="hero-orbit hero-orbit-reverse absolute h-[66%] max-h-[330px] aspect-square rounded-full border border-violet-300/40" aria-hidden="true" />
                    <div className="hero-media-card relative z-[2] h-[82%] max-h-[390px] w-[84%] max-w-[500px] overflow-hidden rounded-[1.75rem] border border-white/90 bg-white/80 p-2 shadow-2xl shadow-purple-900/15 backdrop-blur-xl">
                      <div className="relative h-full w-full overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-purple-100 via-white to-violet-100">
                        {isActive && slide.videoSrc ? (
                          <video
                            src={slide.videoSrc}
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="auto"
                            poster={slide.image}
                            className="h-full w-full object-cover"
                          />
                        ) : slide.image ? (
                          <img src={slide.image} alt={slide.title} className="h-full w-full object-cover" />
                        ) : null}
                        <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 via-transparent to-white/25 pointer-events-none" />
                      </div>
                    </div>
                    <div className="hero-glass hero-float-chip absolute left-0 top-5 z-[3] hidden items-center gap-2 rounded-2xl px-3 py-2 text-xs font-extrabold text-slate-800 sm:flex lg:-left-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-500 text-white">JP</span>
                      Hiroshima, Japan
                    </div>
                    <div className="hero-glass hero-float-chip hero-float-chip-delayed absolute bottom-4 right-0 z-[3] hidden items-center gap-2 rounded-2xl px-3 py-2 text-xs font-extrabold text-slate-800 sm:flex lg:-right-2">
                      <ShieldCheck className="h-5 w-5 text-purple-500" />
                      {slide.highlights?.[1] || slide.badge}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative z-[2] grid h-full grid-rows-[auto_1fr] gap-2 px-7 pb-16 pt-8 sm:px-10 sm:pt-10 md:grid-cols-[.9fr_1.1fr] md:grid-rows-1 md:gap-7 md:px-14 md:py-12 xl:px-20">
                  <div className="relative z-10 flex min-w-0 flex-col justify-center">
                    {slide.badge && (
                      <span className="hero-glass mb-4 inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-purple-700 sm:text-xs">
                        <Sparkles className="h-3.5 w-3.5" />
                        {slide.badge}
                      </span>
                    )}
                    <TitleTag className="text-3xl font-black leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-4xl md:text-5xl line-clamp-3">
                      {titleContent}
                    </TitleTag>
                    {slide.subtitle && (
                      <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600 md:text-base line-clamp-2">
                        {slide.subtitle}
                      </p>
                    )}
                    {(slide.priceOriginal || slide.pricePromo) && (
                      <div className="mt-4 flex items-end gap-3">
                        {slide.pricePromo && <span className="text-2xl font-black tracking-tight text-purple-600 sm:text-3xl">{slide.pricePromo}</span>}
                        {slide.priceOriginal && <span className="pb-1 text-sm text-slate-400 line-through">{slide.priceOriginal}</span>}
                      </div>
                    )}
                    <Link
                      to={slide.ctaLink}
                      tabIndex={isActive ? 0 : -1}
                      className="hero-primary-cta mt-5 inline-flex w-fit items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-purple-500/25 transition-all duration-300 hover:-translate-y-1 hover:bg-purple-600 hover:shadow-xl active:translate-y-0"
                    >
                      {slide.ctaLabel || 'Saiba Mais'}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>

                  <div className="relative flex min-h-[270px] items-center justify-center md:min-h-0">
                    <div className="hero-orbit absolute h-[92%] max-h-[440px] aspect-square rounded-full border border-purple-300/45" aria-hidden="true" />
                    <div className="hero-product-card relative z-[2] flex h-[88%] w-[88%] max-w-[580px] items-center justify-center overflow-hidden rounded-[2rem] border border-white bg-white/80 p-5 shadow-2xl shadow-purple-900/15 backdrop-blur-xl sm:p-8">
                      {isActive && slide.videoSrc ? (
                        <video
                          src={slide.videoSrc}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="auto"
                          poster={slide.image}
                          className="hero-product-media h-full w-full object-contain"
                        />
                      ) : slide.image ? (
                        <img src={slide.image} alt={slide.title} className="hero-product-media h-full w-full object-contain" />
                      ) : null}
                      <div className="absolute inset-x-8 bottom-3 h-8 rounded-[100%] bg-purple-500/10 blur-xl" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={goToPrevious}
            className="hero-glass absolute left-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-2xl text-slate-800 transition-all hover:scale-105 hover:border-purple-300 hover:text-purple-600 sm:left-5 sm:flex"
            aria-label="Slide anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={goToNextManual}
            className="hero-glass absolute right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-2xl text-slate-800 transition-all hover:scale-105 hover:border-purple-300 hover:text-purple-600 sm:right-5 sm:flex"
            aria-label="Próximo slide"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="hero-glass absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full px-3 py-2">
            <span className="min-w-7 text-[10px] font-black tabular-nums text-slate-500">
              {String(currentIndex + 1).padStart(2, '0')}
            </span>
            <div className="flex items-center gap-1.5">
              {slides.map((slide, index) => (
                <button
                  type="button"
                  key={slide.id}
                  onClick={() => goToSlide(index)}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    index === currentIndex ? 'w-10 bg-purple-500' : 'w-2 bg-slate-300 hover:bg-purple-300'
                  )}
                  aria-label={`Ir para o slide ${index + 1}`}
                  aria-current={index === currentIndex ? 'true' : undefined}
                />
              ))}
            </div>
            <span className="min-w-7 text-right text-[10px] font-black tabular-nums text-slate-400">
              {String(slides.length).padStart(2, '0')}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default HeroCarousel;
