import React, { useEffect, useRef, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { siteContentService, HomeContent } from '@/services/siteContentService';
import { getCookieConsent } from '@/hooks/useCookieConsent';

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function YouTubeLazyEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { observer.disconnect(); } },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <div ref={ref} className="absolute inset-0 bg-black cursor-pointer" onClick={() => setActive(true)}>
      {active ? (
        <iframe
          src={`https://${getCookieConsent() === 'accepted' ? 'www.youtube.com' : 'www.youtube-nocookie.com'}/embed/${videoId}?autoplay=1`}
          title={title}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <>
          <img
            src={thumb}
            alt={title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition">
            <PlayCircle className="w-16 h-16 text-white drop-shadow-lg" />
          </div>
        </>
      )}
    </div>
  );
}

const HomeVideos: React.FC = () => {
  const [content, setContent] = useState<HomeContent | null>(null);

  useEffect(() => {
    siteContentService.getHome().then(setContent);
  }, []);

  if (!content || content.videos.length === 0) return null;

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
            {content.videosTitle}
          </h2>
          {content.videosSubtitle && (
            <p className="text-muted-foreground max-w-2xl mx-auto">{content.videosSubtitle}</p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {content.videos.map((v) => {
            const videoId = getYouTubeId(v.url);
            return (
              <div key={v.id} className="rounded-2xl overflow-hidden bg-card border border-border shadow-card">
                <div className="aspect-video bg-black relative">
                  {videoId ? (
                    <YouTubeLazyEmbed videoId={videoId} title={v.title} />
                  ) : (
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 flex items-center justify-center text-white hover:bg-black/60 transition"
                    >
                      <PlayCircle className="w-14 h-14" />
                    </a>
                  )}
                </div>
                {v.title && (
                  <div className="p-4">
                    <h3 className="font-display text-lg font-semibold text-foreground">{v.title}</h3>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HomeVideos;
