import React, { useState } from 'react';
import { Cookie, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { useLanguage } from '@/context/LanguageContext';

const CookieBanner: React.FC = () => {
  const { consent, accept, decline } = useCookieConsent();
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  // Não mostra se o usuário já escolheu (localStorage 'cookie_consent' = 'accepted' | 'declined')
  if (consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label={t('cookieBanner.ariaLabel')}
      className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-20 sm:p-6 sm:pb-6 animate-in slide-in-from-bottom duration-300"
    >
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-pink-400 to-pink-400" />

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center">
              <Cookie className="w-5 h-5 text-pink-500" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h2 className="font-bold text-gray-900 text-base">
                  {t('cookieBanner.title')}
                </h2>
                <button
                  onClick={decline}
                  aria-label={t('cookieBanner.decline.ariaLabel')}
                  className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-sm text-gray-600 leading-relaxed">
                {t('cookieBanner.description').split('{lgpd}')[0]}
                <strong>{t('cookieBanner.lgpd')}</strong>
                {t('cookieBanner.description').split('{lgpd}')[1]}
              </p>

              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1 text-xs text-pink-500 hover:text-pink-600 mt-2 font-medium transition-colors"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? t('cookieBanner.hideDetails') : t('cookieBanner.showDetails')}
              </button>

              {expanded && (
                <div className="mt-3 grid sm:grid-cols-3 gap-2">
                  {[
                    { emoji: '✅', title: t('cookieBanner.essential.title'), desc: t('cookieBanner.essential.desc'), required: true },
                    { emoji: '📊', title: t('cookieBanner.analytics.title'), desc: t('cookieBanner.analytics.desc'), required: false },
                    { emoji: '▶️', title: t('cookieBanner.youtube.title'), desc: t('cookieBanner.youtube.desc'), required: false },
                  ].map(item => (
                    <div key={item.title} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs font-bold text-gray-800 mb-1">
                        {item.emoji} {item.title}
                        {item.required && (
                          <span className="ml-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">{t('cookieBanner.essential.required')}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <button
                  onClick={accept}
                  className="flex-1 bg-pink-500 hover:bg-pink-600 active:scale-95 text-white font-bold text-sm py-2.5 px-5 rounded-xl transition-all duration-200 shadow-sm"
                >
                  {t('cookieBanner.acceptAll')}
                </button>
                <button
                  onClick={decline}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 font-bold text-sm py-2.5 px-5 rounded-xl transition-all duration-200"
                >
                  {t('cookieBanner.essentialOnly')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieBanner;
