import React, { useState, useRef, useEffect } from 'react';
import { useLanguage, CountryType } from '@/context/LanguageContext';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import FlagIcon from '@/components/FlagIcon';
import { WORLD_COUNTRIES } from '@/data/worldCountries';

const CountrySwitcher: React.FC = () => {
  const { selectedCountry, setSelectedCountry, t } = useLanguage();
  const { items } = useCart();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const countries: { code: CountryType; flagCode: string; label: string; details: string }[] =
    WORLD_COUNTRIES.map(c => ({
      code: c.name,
      flagCode: c.iso,
      label: c.name,
      details: c.name === 'Japão' ? 'NikkeyBox (Local)' : 'NikkeyBox (Aéreo)',
    }));

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape, return focus to trigger
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

  const handleCountryChange = (country: CountryType) => {
    setSelectedCountry(country);
    const selected = countries.find(c => c.code === country);
    toast({
      title: t('a11y.toast.countryChanged.title'),
      description: t('a11y.toast.countryChanged.desc')
        .replace('{country}', country)
        .replace('{details}', selected?.details || ''),
    });
  };

  const currentCountry = countries.find(c => c.code === selectedCountry) || countries[0];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Dropdown Button */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="country-switcher-menu"
        aria-label={`${t('a11y.selectCountry')}: ${currentCountry.label}`}
        className="flex items-center gap-2 px-3 py-1.5 bg-secondary/80 border border-border rounded-full hover:bg-secondary transition-all text-xs font-semibold text-foreground shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <FlagIcon code={currentCountry.flagCode} alt="" size={20} />
        <span>{currentCountry.label}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} aria-hidden="true" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          id="country-switcher-menu"
          role="menu"
          aria-label={t('a11y.selectCountry')}
          className="absolute right-0 mt-2 w-56 rounded-xl bg-card border border-border shadow-lg z-50 py-1.5 animate-fade-in"
        >
          {/* Busca */}
          <div className="px-2 pb-1.5 border-b border-border mb-1">
            <label htmlFor="country-search-input" className="sr-only">{t('a11y.searchCountry')}</label>
            <input
              id="country-search-input"
              autoFocus
              type="text"
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              placeholder={t('a11y.searchCountry')}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
          {countries
            .filter(c => !countrySearch || c.label.toLowerCase().includes(countrySearch.toLowerCase()))
            .map((countryItem) => (
            <button
              key={countryItem.code}
              role="menuitemradio"
              aria-checked={selectedCountry === countryItem.code}
              onClick={() => {
                handleCountryChange(countryItem.code);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2 text-xs text-left transition-colors font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
                selectedCountry === countryItem.code
                  ? "bg-primary/10 text-primary font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <div className="flex items-center gap-2">
                <FlagIcon code={countryItem.flagCode} alt="" size={20} />
                <span>{countryItem.label}</span>
              </div>
              {selectedCountry === countryItem.code && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true"></span>
              )}
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CountrySwitcher;
