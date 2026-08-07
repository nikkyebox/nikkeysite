import React, { useEffect, useState } from 'react';
import { Download, Share, X, Plus } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

type Platform = 'android' | 'ios' | null;

// Detecta plataforma mobile
const detectPlatform = (): Platform => {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null;
};

// App já está instalado como PWA (sem barra do browser = standalone)
const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true;

const DISMISSED_KEY = 'pwa_install_dismissed';
const DISMISS_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 dias

const wasDismissed = (): boolean => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_TTL;
  } catch { return false; }
};

const markDismissed = () => {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /**/ }
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallPrompt: React.FC = () => {
  const { t } = useLanguage();
  const [platform, setPlatform]   = useState<Platform>(null);
  const [visible,  setVisible]    = useState(false);
  const [iosGuide, setIosGuide]   = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Não mostra se: já instalado, já dispensado recentemente, ou desktop
    if (isStandalone() || wasDismissed()) return;

    const p = detectPlatform();
    if (!p) return;
    setPlatform(p);

    if (p === 'android') {
      // Captura o evento nativo de instalação do Chrome
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setVisible(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }

    if (p === 'ios') {
      // iOS não tem evento nativo — mostra instrução manual após 3s
      const t = setTimeout(() => setVisible(true), 3_000);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    markDismissed();
    setVisible(false);
    setIosGuide(false);
  };

  const installAndroid = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') markDismissed();
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible) return null;

  // ── Banner Android ───────────────────────────────────────────────────────────
  if (platform === 'android') {
    return (
      <div className="fixed bottom-0 inset-x-0 z-[9998] p-4 animate-in slide-in-from-bottom duration-300">
        <div className="max-w-lg mx-auto bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-pink-400 to-pink-400" />
          <div className="p-4 flex items-center gap-4">
            <img src="/icons/icon-72x72.png" alt="NikkeyBox" className="w-14 h-14 rounded-xl shadow-md flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-tight">{t('install.android.title')}</p>
              <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
                {t('install.android.desc')}
              </p>
            </div>
            <button onClick={dismiss} className="text-gray-500 hover:text-gray-300 p-1 flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={dismiss}
              className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors"
            >
              {t('install.notNow')}
            </button>
            <button
              onClick={installAndroid}
              className="flex-1 py-2 rounded-xl bg-pink-500 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-pink-600 transition-colors"
            >
              <Download className="w-4 h-4" /> {t('install.installBtn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Banner iOS (instrução manual) ────────────────────────────────────────────
  if (platform === 'ios') {
    if (!iosGuide) {
      return (
        <div className="fixed bottom-0 inset-x-0 z-[9998] p-4 animate-in slide-in-from-bottom duration-300">
          <div className="max-w-lg mx-auto bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-pink-400 to-pink-400" />
            <div className="p-4 flex items-center gap-4">
              <img src="/icons/icon-72x72.png" alt="NikkeyBox" className="w-14 h-14 rounded-xl shadow-md flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">{t('install.ios.title')}</p>
                <p className="text-gray-400 text-xs mt-0.5">{t('install.ios.desc')}</p>
              </div>
              <button onClick={dismiss} className="text-gray-500 hover:text-gray-300 p-1 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-4 flex gap-2">
              <button onClick={dismiss} className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors">
                {t('install.notNow')}
              </button>
              <button
                onClick={() => setIosGuide(true)}
                className="flex-1 py-2 rounded-xl bg-pink-500 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-pink-600 transition-colors"
              >
                <Share className="w-4 h-4" /> {t('install.ios.howTo')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Guia passo a passo iOS
    return (
      <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-sm mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-pink-400 to-pink-400" />
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <img src="/icons/icon-72x72.png" alt="" className="w-8 h-8 rounded-lg" />
                <span className="font-bold text-gray-900">{t('install.ios.guideTitle')}</span>
              </div>
              <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{t('install.ios.step1.title')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t('install.ios.step1.desc')} <Share className="inline w-3 h-3" /></p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{t('install.ios.step2.title')}</p>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">{t('install.ios.step2.desc')} <Plus className="inline w-3 h-3" /></p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{t('install.ios.step3.title')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t('install.ios.step3.desc')}</p>
                </div>
              </div>
            </div>

            <button
              onClick={dismiss}
              className="w-full mt-4 py-2.5 rounded-xl bg-pink-500 text-white text-sm font-bold hover:bg-pink-600 transition-colors"
            >
              {t('install.ios.gotIt')}
            </button>
          </div>
        </div>

        {/* Seta apontando para a barra inferior (onde fica o botão Compartilhar no Safari) */}
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-white text-center">
          <div className="text-3xl animate-bounce">↓</div>
          <p className="text-xs bg-black/60 px-3 py-1 rounded-full mt-1">{t('install.ios.safariBar')}</p>
        </div>
      </div>
    );
  }

  return null;
};

export default InstallPrompt;
