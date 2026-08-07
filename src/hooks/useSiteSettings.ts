import { useState, useEffect } from 'react';
import { siteContentService, SiteSettings } from '@/services/siteContentService';

const DEFAULT: SiteSettings = { vlogEnabled: false };

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT);

  useEffect(() => {
    // Try localStorage first (instant), then Firestore
    try {
      const cached = localStorage.getItem('je_site_settings');
      if (cached) setSettings({ ...DEFAULT, ...JSON.parse(cached) });
    } catch {}
    siteContentService.getSettings().then(setSettings).catch(() => {});
  }, []);

  const saveSettings = async (next: SiteSettings) => {
    setSettings(next);
    await siteContentService.saveSettings(next);
  };

  return { settings, saveSettings };
}
