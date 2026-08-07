import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/data/translations';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import FlagIcon from '@/components/FlagIcon';

const LANGUAGES: { code: Language; flagCode: string; label: string }[] = [
  { code: 'pt', flagCode: 'br', label: 'Português' },
  { code: 'en', flagCode: 'us', label: 'English' },
  { code: 'ja', flagCode: 'jp', label: '日本語' },
];

const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const current = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="language-switcher-menu"
        aria-label={`${t('a11y.selectLanguage')}: ${current.label}`}
        className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-secondary/80 border border-border rounded-full hover:bg-secondary transition-all text-xs font-semibold text-foreground shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <FlagIcon code={current.flagCode} alt="" size={20} />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className={cn("w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          id="language-switcher-menu"
          role="menu"
          aria-label={t('a11y.selectLanguage')}
          className="absolute right-0 mt-2 w-40 rounded-xl bg-card border border-border shadow-lg z-50 py-1.5 animate-fade-in"
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              role="menuitemradio"
              aria-checked={language === lang.code}
              onClick={() => { setLanguage(lang.code); setIsOpen(false); triggerRef.current?.focus(); }}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2 text-xs text-left transition-colors font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
                language === lang.code
                  ? "bg-primary/10 text-primary font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <div className="flex items-center gap-2">
                <FlagIcon code={lang.flagCode} alt="" size={20} />
                <span>{lang.label}</span>
              </div>
              {language === lang.code && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
