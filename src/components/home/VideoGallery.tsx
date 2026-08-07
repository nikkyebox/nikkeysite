import React, { useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface VideoItem {
  src: string;
  title: string;
  flavor: string;
}

const VideoGallery: React.FC = () => {
  const { t } = useLanguage();
  const [activeVideo, setActiveVideo] = useState<number | null>(null);
  const [mutedStates, setMutedStates] = useState<Record<number, boolean>>({});
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const videos: VideoItem[] = [
    { src: '/video/preparo.mp4', title: 'Preparo Artesanal', flavor: '🍯' },
    { src: '/video/tradicional.mp4', title: 'Doce Cremoso', flavor: '🥄' },
    { src: '/video/coco.mp4', title: 'Sabor Coco', flavor: '🥥' },
    { src: '/video/cafe.mp4', title: 'Sabor Café', flavor: '☕' },
    { src: '/video/amendoim.mp4', title: 'Sabor Amendoim', flavor: '🥜' },
    { src: '/video/cholate.mp4', title: 'Sabor Chocolate', flavor: '🍫' },
  ];

  const togglePlay = (index: number) => {
    const video = videoRefs.current[index];
    if (!video) return;

    if (activeVideo === index) {
      video.pause();
      setActiveVideo(null);
    } else {
      // Pause other videos
      videoRefs.current.forEach((v, i) => {
        if (v && i !== index) v.pause();
      });
      video.play();
      setActiveVideo(index);
    }
  };

  const toggleMute = (index: number) => {
    const video = videoRefs.current[index];
    if (!video) return;
    video.muted = !video.muted;
    setMutedStates(prev => ({ ...prev, [index]: video.muted }));
  };

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-up">
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            {t('videos.badge')}
          </span>
          <h2 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
            {t('videos.title')}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('videos.description')}
          </p>
        </div>

        {/* Videos Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video, index) => (
            <div
              key={index}
              className="group relative rounded-2xl overflow-hidden bg-card border border-border shadow-card hover:shadow-elevated transition-all duration-300"
            >
              <div className="aspect-[4/3] relative">
                <video
                  ref={(el) => { videoRefs.current[index] = el; }}
                  src={video.src}
                  loop
                  muted
                  playsInline
                  preload="none"
                  className="w-full h-full object-cover"
                  onEnded={() => setActiveVideo(null)}
                />

                {/* Overlay */}
                <div
                  className="absolute inset-0 bg-foreground/20 group-hover:bg-foreground/10 transition-colors cursor-pointer flex items-center justify-center"
                  onClick={() => togglePlay(index)}
                >
                  {activeVideo !== index && (
                    <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                      <Play className="w-7 h-7 text-primary-foreground ml-1" fill="currentColor" />
                    </div>
                  )}
                </div>

                {/* Controls */}
                {activeVideo === index && (
                  <div className="absolute bottom-3 right-3 flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePlay(index); }}
                      className="w-10 h-10 rounded-full bg-foreground/60 backdrop-blur-sm flex items-center justify-center text-background hover:bg-foreground/80 transition-colors"
                    >
                      <Pause className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMute(index); }}
                      className="w-10 h-10 rounded-full bg-foreground/60 backdrop-blur-sm flex items-center justify-center text-background hover:bg-foreground/80 transition-colors"
                    >
                      {mutedStates[index] !== false ? (
                        <VolumeX className="w-5 h-5" />
                      ) : (
                        <Volume2 className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Title */}
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{video.flavor}</span>
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    {video.title}
                  </h3>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default VideoGallery;
