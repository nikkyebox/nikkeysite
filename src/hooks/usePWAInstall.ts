import { useState, useEffect } from 'react';

export type PWAPlatform = 'android' | 'ios' | 'desktop' | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Variável global para preservar o evento entre remontagens de componentes
let _deferredPrompt: BeforeInstallPromptEvent | null = null;

export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true;

export const detectPlatform = (): PWAPlatform => {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
};

export const usePWAInstall = () => {
  const [platform, setPlatform]         = useState<PWAPlatform>(null);
  const [canInstall, setCanInstall]     = useState(false);
  const [isInstalled, setIsInstalled]   = useState(false);

  useEffect(() => {
    setIsInstalled(isStandalone());
    const p = detectPlatform();
    setPlatform(p);

    if (p === 'android') {
      // Se o evento já foi capturado antes (ex: InstallPrompt já montou)
      if (_deferredPrompt) { setCanInstall(true); return; }

      const handler = (e: Event) => {
        e.preventDefault();
        _deferredPrompt = e as BeforeInstallPromptEvent;
        setCanInstall(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }

    // iOS e desktop: sempre "pode instalar" (via instruções)
    if (p === 'ios' || p === 'desktop') setCanInstall(true);
  }, []);

  const install = async (): Promise<'accepted' | 'dismissed' | 'ios' | 'desktop'> => {
    if (platform === 'android' && _deferredPrompt) {
      await _deferredPrompt.prompt();
      const { outcome } = await _deferredPrompt.userChoice;
      _deferredPrompt = null;
      setCanInstall(false);
      return outcome;
    }
    return platform === 'ios' ? 'ios' : 'desktop';
  };

  return { platform, canInstall, isInstalled, install };
};
