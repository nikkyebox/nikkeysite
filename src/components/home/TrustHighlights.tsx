import React from 'react';
import { HeartHandshake, PlaneTakeoff, ShieldCheck, Sparkles } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const ITEMS = [
  { icon: ShieldCheck, key: 'trust1' },
  { icon: PlaneTakeoff, key: 'trust2' },
  { icon: Sparkles, key: 'trust3' },
  { icon: HeartHandshake, key: 'trust4' },
] as const;

/** Garantias da loja: lista neutra, ícone na cor de destaque, sem caixa-alta. */
export const TrustHighlights: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section className="border-t border-border py-10" aria-label={t('trust.aria')}>
      <div className="container mx-auto px-4">
        <ul className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t(`ui.home.${key}.title`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`ui.home.${key}.desc`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default TrustHighlights;
