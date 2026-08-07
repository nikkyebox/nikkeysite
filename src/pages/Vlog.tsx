import React, { useEffect, useState } from 'react';
import { Play, Calendar, Clock, Eye, X } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { useLanguage } from '@/context/LanguageContext';
import { siteContentService, VlogContent, VlogVideo } from '@/services/siteContentService';

// Extrai o ID do YouTube de um link ou retorna o próprio se já for ID (11 chars)
const getYouTubeId = (s: string): string => {
  if (!s) return '';
  const m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return m[1];
  if (/^[\w-]{11}$/.test(s.trim())) return s.trim();
  return '';
};

interface DisplayVideo {
  id: string;
  title: string;
  description: string;
  ytId: string;
  thumbnail?: string;
  duration?: string;
  date?: string;
  views?: string;
}

const Vlog: React.FC = () => {
  const { t, language } = useLanguage();
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [vlog, setVlog] = useState<VlogContent | null>(null);

  useEffect(() => {
    siteContentService.getVlog().then(setVlog);
  }, []);

  // Vídeos padrão (fallback quando o admin ainda não cadastrou nada)
  const defaultVideos = [
    { id: 1, titleKey: 'vlog.video1.title', descKey: 'vlog.video1.desc', thumbnail: '', videoUrl: 'tYcA1j-fcKg', duration: '14:02', date: '2026-05-15', views: '12.5K' },
    { id: 2, titleKey: 'vlog.video2.title', descKey: 'vlog.video2.desc', thumbnail: '', videoUrl: '1xN5_p-lU0Y', duration: '12:45', date: '2026-05-08', views: '8.2K' },
    { id: 3, titleKey: 'vlog.video3.title', descKey: 'vlog.video3.desc', thumbnail: '', videoUrl: 'S7R97sV1w8k', duration: '13:28', date: '2026-05-01', views: '9.8K' },
    { id: 4, titleKey: 'vlog.video4.title', descKey: 'vlog.video4.desc', thumbnail: '', videoUrl: '1xN5_p-lU0Y', duration: '12:45', date: '2026-04-20', views: '14.1K' },
    { id: 5, titleKey: 'vlog.video5.title', descKey: 'vlog.video5.desc', thumbnail: '', videoUrl: 'tYcA1j-fcKg', duration: '14:02', date: '2026-04-10', views: '4.9K' },
    { id: 6, titleKey: 'vlog.video6.title', descKey: 'vlog.video6.desc', thumbnail: '', videoUrl: 'S7R97sV1w8k', duration: '13:28', date: '2026-04-01', views: '3.5K' },
  ];

  const normDefault = (v: typeof defaultVideos[number]): DisplayVideo => ({
    id: String(v.id),
    title: t(v.titleKey),
    description: t(v.descKey),
    ytId: getYouTubeId(v.videoUrl),
    thumbnail: v.thumbnail || undefined,
    duration: v.duration,
    date: v.date,
    views: v.views,
  });
  const normAdmin = (v: VlogVideo): DisplayVideo => ({
    id: v.id,
    title: v.title,
    description: v.description || '',
    ytId: getYouTubeId(v.url),
    thumbnail: v.thumbnail || undefined,
    duration: v.duration,
    date: v.date,
    views: v.views,
  });

  // Monta destaque + grade (admin tem prioridade; senão usa padrão)
  const hasAdmin = !!(vlog && (vlog.featured?.url || (vlog.videos && vlog.videos.length > 0)));
  let featured: DisplayVideo | undefined;
  let grid: DisplayVideo[] = [];
  if (hasAdmin) {
    const adminVids = (vlog!.videos || []).map(normAdmin);
    if (vlog!.featured?.url) {
      featured = normAdmin(vlog!.featured);
      grid = adminVids;
    } else {
      featured = adminVids[0];
      grid = adminVids.slice(1);
    }
  } else {
    const defs = defaultVideos.map(normDefault);
    featured = defs[0];
    grid = defs.slice(1);
  }

  const getThumb = (v: DisplayVideo) =>
    v.thumbnail && (v.thumbnail.startsWith('/') || v.thumbnail.startsWith('http'))
      ? v.thumbnail
      : v.ytId
        ? `https://img.youtube.com/vi/${v.ytId}/hqdefault.jpg`
        : '/placeholder.svg';

  const youtubeUrl = import.meta.env.VITE_YOUTUBE_URL || 'https://www.youtube.com';
  const instagramUrl = import.meta.env.VITE_INSTAGRAM_URL || 'https://www.instagram.com';
  const dateLocale = language === 'pt' ? 'pt-BR' : language === 'ja' ? 'ja-JP' : 'en-US';

  const pageTitle = vlog?.title || t('vlog.title');
  const pageSubtitle = vlog?.subtitle || t('vlog.description');

  return (
    <Layout>
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">{pageTitle}</h1>
            <p className="text-muted-foreground text-lg">{pageSubtitle}</p>
          </div>
        </div>
      </div>

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          {/* Featured Video */}
          {featured && (
            <div className="mb-12">
              <div
                className="relative aspect-video rounded-3xl overflow-hidden bg-secondary/50 shadow-elevated group cursor-pointer border border-border/40"
                onClick={() => featured?.ytId && setPlayingVideo(featured.ytId)}
              >
                <img
                  src={getThumb(featured)}
                  alt={featured.title}
                  loading="eager"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    if (!e.currentTarget.src.endsWith('/placeholder.svg')) {
                      e.currentTarget.src = '/placeholder.svg';
                    }
                  }}
                />
                <div className="absolute inset-0 bg-black/45 group-hover:bg-black/35 transition-colors duration-300" />

                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white px-4">
                    <button className="group w-20 h-20 rounded-full bg-white/95 text-primary shadow-elevated flex items-center justify-center transition-transform hover:scale-110 mb-5 mx-auto">
                      <Play className="w-8 h-8 text-primary fill-primary ml-1" />
                    </button>
                    <h2 className="font-display text-2xl lg:text-3xl font-bold mb-2 drop-shadow-md">{featured.title}</h2>
                    <p className="text-white/90 text-sm max-w-lg mx-auto leading-relaxed drop-shadow-sm">{featured.description}</p>
                  </div>
                </div>

                <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between text-white/95">
                  <div className="flex items-center gap-4 text-xs font-bold">
                    {featured.duration && (
                      <span className="flex items-center gap-1 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <Clock className="w-3.5 h-3.5" />
                        {featured.duration}
                      </span>
                    )}
                    {featured.views && (
                      <span className="flex items-center gap-1 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <Eye className="w-3.5 h-3.5" />
                        {featured.views} {t('vlog.views')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Video Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {grid.map((video) => (
              <div
                key={video.id}
                className="group bg-card rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                onClick={() => video.ytId && setPlayingVideo(video.ytId)}
              >
                <div className="aspect-video bg-secondary/50 relative overflow-hidden">
                  <img
                    src={getThumb(video)}
                    alt={video.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500"
                    onError={(e) => {
                      if (!e.currentTarget.src.endsWith('/placeholder.svg')) {
                        e.currentTarget.src = '/placeholder.svg';
                      }
                    }}
                  />

                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                    <div className="w-14 h-14 rounded-full bg-white text-primary flex items-center justify-center shadow-lg">
                      <Play className="w-6 h-6 text-primary fill-primary ml-1" />
                    </div>
                  </div>

                  {video.duration && (
                    <div className="absolute bottom-3 right-3">
                      <span className="px-2.5 py-1 rounded-lg bg-black/75 text-white text-[10px] font-bold">{video.duration}</span>
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {video.title}
                    </h3>
                    {video.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">{video.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-4 text-[10px] text-muted-foreground border-t border-border/60 pt-3">
                    {video.date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(video.date).toLocaleDateString(dateLocale)}
                      </span>
                    )}
                    {video.views && (
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        {video.views} {t('vlog.views')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Subscribe CTA */}
          <div className="mt-16 text-center p-8 rounded-3xl bg-card border border-border">
            <span className="text-4xl mb-4 block">📺</span>
            <h3 className="font-display text-2xl font-bold text-foreground mb-2">{t('vlog.subscribe')}</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">{t('vlog.subscribeDesc')}</p>
            <div className="flex justify-center gap-4">
              <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-2.5 rounded-full bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors text-sm">
                YouTube
              </a>
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-2.5 rounded-full gradient-caramel text-primary-foreground font-medium hover:opacity-90 transition-opacity text-sm">
                Instagram
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Video Modal Player */}
      {playingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in p-4">
          <div className="relative w-full max-w-4xl bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            <button
              onClick={() => setPlayingVideo(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-primary transition-all"
              aria-label="Close video"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="aspect-video w-full bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${playingVideo}?autoplay=1&rel=0`}
                title="Video Player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full"
              ></iframe>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Vlog;
