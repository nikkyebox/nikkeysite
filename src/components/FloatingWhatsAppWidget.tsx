import React, { useEffect, useId, useRef, useState } from 'react';
import { Building2, MessageCircle, ShieldCheck, Sparkles, Truck, X } from 'lucide-react';
import { COMPANY_PROFILE } from '@/config/companyProfile';
import { useLanguage } from '@/context/LanguageContext';

const WHATSAPP_NUMBER = COMPANY_PROFILE.whatsapp.digits;

const OPTIONS = [
  { icon: MessageCircle, key: 'opt1' },
  { icon: Sparkles, key: 'opt2' },
  { icon: Truck, key: 'opt3' },
  { icon: Building2, key: 'opt4' },
] as const;

/**
 * Atalho flutuante para o WhatsApp. Popover ancorado (não modal): Esc fecha,
 * o foco entra na primeira opção e volta ao botão ao fechar; clique fora fecha.
 */
export const FloatingWhatsAppWidget: React.FC = () => {
  const { t, language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const close = () => { setIsOpen(false); triggerRef.current?.focus(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [isOpen]);

  const waHref = (message: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  return (
    <div ref={rootRef} className="fixed bottom-4 right-4 z-50 flex flex-col items-end sm:bottom-6 sm:right-6">
      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={t('whatsapp.title')}
          className="mb-3 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
        >
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 className="text-sm font-semibold">{t('whatsapp.title')}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> {t('whatsapp.online')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setIsOpen(false); triggerRef.current?.focus(); }}
              className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('shell.close')}
              title={t('shell.close')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{t('wa.intro')}</p>

          <ul className="space-y-1">
            {OPTIONS.map(({ icon: Icon, key }) => (
              <li key={key}>
                <a
                  href={waHref(t(`wa.${key}.msg`))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-md p-2.5 transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{t(`wa.${key}.title`)}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{t(`wa.${key}.desc`)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {t('whatsapp.ptOnly')}
            </span>
            <span>{`${language === 'pt' ? COMPANY_PROFILE.fulfillmentOrigin.shortPt : COMPANY_PROFILE.fulfillmentOrigin.short}, ${t('wa.country')}`}</span>
          </div>
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={t('whatsapp.open')}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        className="flex h-12 items-center gap-2 rounded-full bg-emerald-600 px-4 text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)] transition-colors duration-150 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <MessageCircle className="h-6 w-6" aria-hidden="true" />
        <span className="hidden text-sm font-semibold sm:inline">{t('wa.button')}</span>
      </button>
    </div>
  );
};

export default FloatingWhatsAppWidget;
