import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Play } from 'lucide-react';

const PresentationVideo: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            {t('presentation.badge')}
          </span>
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-foreground mb-4">
            {t('presentation.title')}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('presentation.description')}
          </p>
        </div>
        
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden shadow-elevated aspect-video bg-black">
            <video
              className="w-full h-full object-cover"
              controls
              poster="/video/inicio.jpg"
              preload="metadata"
            >
              <source src="/video/apresentacao.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PresentationVideo;
