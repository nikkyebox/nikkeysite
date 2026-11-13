import React, { useState } from 'react';
import { Mail, CheckCircle2, Loader2 } from 'lucide-react';
import { newsletterService } from '@/services/newsletterService';
import { useLanguage } from '@/context/LanguageContext';

/** Captação de e-mail na home — mesmo serviço de leads já usado no popup de saída. */
const NewsletterSection: React.FC = () => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'invalid'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setStatus('invalid');
      return;
    }
    setStatus('loading');
    await newsletterService.capture({ email: value, source: 'newsletter_footer' });
    setStatus('done');
    setEmail('');
  };

  return (
    <section className="py-16 bg-gradient-to-br from-primary to-accent">
      <div className="container mx-auto px-4">
        <div className="max-w-xl mx-auto text-center text-primary-foreground">
          <Mail className="w-10 h-10 mx-auto mb-3" />
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">
            {t('newsletter.title')}
          </h2>
          <p className="text-white/90 mb-6">
            {t('newsletter.desc')}
          </p>

          {status === 'done' ? (
            <div className="flex items-center justify-center gap-2 bg-white/15 backdrop-blur rounded-xl py-3.5 px-5 font-semibold">
              <CheckCircle2 className="w-5 h-5" />
              {t('newsletter.done')}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (status === 'invalid') setStatus('idle'); }}
                placeholder={t('newsletter.placeholder')}
                className="flex-1 rounded-xl px-4 py-3 text-foreground font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-foreground"
                required
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="bg-foreground hover:bg-foreground/90 text-background font-bold rounded-xl px-6 py-3 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {status === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : t('ui.home.subscribe')}
              </button>
            </form>
          )}
          {status === 'invalid' && (
            <p className="text-sm text-white/90 mt-2 font-medium">{t('newsletter.invalid')}</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default NewsletterSection;
