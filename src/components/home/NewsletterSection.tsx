import React, { useId, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { newsletterService } from '@/services/newsletterService';
import { useLanguage } from '@/context/LanguageContext';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Captação de e-mail na home — mesmo serviço de leads do popup de saída.
 *  Validação no blur (nunca durante a digitação) e o erro some ao corrigir. */
const NewsletterSection: React.FC = () => {
  const { t } = useLanguage();
  const id = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [invalid, setInvalid] = useState(false);
  const [failed, setFailed] = useState(false);

  const isValid = (v: string) => EMAIL_RE.test(v.trim().toLowerCase());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!isValid(value)) {
      setInvalid(true);
      return;
    }
    setStatus('loading');
    setFailed(false);
    try {
      await newsletterService.capture({ email: value, source: 'newsletter_footer' });
      setStatus('done');
      setEmail('');
    } catch {
      setStatus('idle');
      setFailed(true);
    }
  };

  return (
    <section className="py-16" aria-labelledby={`${id}-title`}>
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-6 sm:p-8">
          <h2 id={`${id}-title`} className="font-display text-2xl font-semibold tracking-tight">
            {t('newsletter.title')}
          </h2>
          <p className="mt-2 text-base text-muted-foreground">{t('newsletter.desc')}</p>

          {status === 'done' ? (
            <p className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300" role="status">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              {t('newsletter.done')}
            </p>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="mt-6">
              <label htmlFor={`${id}-email`} className="mb-1.5 block text-sm font-medium">{t('newsletter.label')}</label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id={`${id}-email`}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (invalid) setInvalid(false); }}
                  onBlur={() => { if (email.trim()) setInvalid(!isValid(email)); }}
                  placeholder={t('newsletter.placeholder')}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? `${id}-error` : undefined}
                  className="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70"
                >
                  {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {t('ui.home.subscribe')}
                </button>
              </div>
              {invalid && (
                <p id={`${id}-error`} className="mt-2 text-sm text-destructive">{t('newsletter.invalid')}</p>
              )}
              {failed && (
                <p className="mt-2 text-sm text-destructive" role="alert">{t('newsletter.failed')}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

export default NewsletterSection;
