import React, { useState } from 'react';
import { AlertTriangle, XCircle, AlertCircle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

type Level = 'prohibited' | 'restricted' | 'attention';

interface Item {
  name: string;
  detail?: string;
}

interface Category {
  icon: string;
  title: string;
  level: Level;
  items: Item[];
}

const buildCategories = (t: (key: string) => string): Category[] => [
  {
    icon: '🚫',
    title: t('prohibited.cat.prohibited'),
    level: 'prohibited',
    items: [
      { name: t('prohibited.p1.name'), detail: t('prohibited.p1.detail') },
      { name: t('prohibited.p2.name') },
      { name: t('prohibited.p3.name'), detail: t('prohibited.p3.detail') },
      { name: t('prohibited.p4.name') },
      { name: t('prohibited.p5.name') },
      { name: t('prohibited.p6.name') },
      { name: t('prohibited.p7.name') },
      { name: t('prohibited.p8.name') },
      { name: t('prohibited.p9.name') },
      { name: t('prohibited.p10.name'), detail: t('prohibited.p10.detail') },
    ],
  },
  {
    icon: '⚠️',
    title: t('prohibited.cat.restricted'),
    level: 'restricted',
    items: [
      { name: t('prohibited.r1.name'), detail: t('prohibited.r1.detail') },
      { name: t('prohibited.r2.name'), detail: t('prohibited.r2.detail') },
      { name: t('prohibited.r3.name'), detail: t('prohibited.r3.detail') },
      { name: t('prohibited.r4.name'), detail: t('prohibited.r4.detail') },
      { name: t('prohibited.r5.name'), detail: t('prohibited.r5.detail') },
      { name: t('prohibited.r6.name'), detail: t('prohibited.r6.detail') },
      { name: t('prohibited.r7.name'), detail: t('prohibited.r7.detail') },
      { name: t('prohibited.r8.name'), detail: t('prohibited.r8.detail') },
      { name: t('prohibited.r9.name'), detail: t('prohibited.r9.detail') },
      { name: t('prohibited.r10.name'), detail: t('prohibited.r10.detail') },
    ],
  },
  {
    icon: '💡',
    title: t('prohibited.cat.attention'),
    level: 'attention',
    items: [
      { name: t('prohibited.a1.name'), detail: t('prohibited.a1.detail') },
      { name: t('prohibited.a2.name'), detail: t('prohibited.a2.detail') },
      { name: t('prohibited.a3.name'), detail: t('prohibited.a3.detail') },
      { name: t('prohibited.a4.name'), detail: t('prohibited.a4.detail') },
      { name: t('prohibited.a5.name'), detail: t('prohibited.a5.detail') },
      { name: t('prohibited.a6.name'), detail: t('prohibited.a6.detail') },
      { name: t('prohibited.a7.name'), detail: t('prohibited.a7.detail') },
      { name: t('prohibited.a8.name'), detail: t('prohibited.a8.detail') },
      { name: t('prohibited.a9.name'), detail: t('prohibited.a9.detail') },
      { name: t('prohibited.a10.name'), detail: t('prohibited.a10.detail') },
    ],
  },
];

const levelConfig = {
  prohibited: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    header: 'bg-red-100 dark:bg-red-900/40',
    title: 'text-red-700 dark:text-red-400',
    badge: 'bg-red-600',
    dot: 'bg-red-500',
    icon: XCircle,
  },
  restricted: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    header: 'bg-amber-100 dark:bg-amber-900/40',
    title: 'text-amber-700 dark:text-amber-400',
    badge: 'bg-amber-500',
    dot: 'bg-amber-500',
    icon: AlertTriangle,
  },
  attention: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    header: 'bg-blue-100 dark:bg-blue-900/40',
    title: 'text-blue-700 dark:text-blue-400',
    badge: 'bg-blue-500',
    dot: 'bg-blue-400',
    icon: Info,
  },
};

const ProhibitedItems: React.FC = () => {
  const { t } = useLanguage();
  const CATEGORIES = buildCategories(t);
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  const [search, setSearch] = useState('');

  const toggle = (i: number) => setOpen(prev => ({ ...prev, [i]: !prev[i] }));

  const q = search.toLowerCase();
  const filtered: Category[] = q
    ? CATEGORIES.map(cat => ({
        ...cat,
        items: cat.items.filter(
          it => it.name.toLowerCase().includes(q) || (it.detail || '').toLowerCase().includes(q)
        ),
      })).filter(cat => cat.items.length > 0)
    : CATEGORIES;

  return (
    <div className="space-y-6">
      {/* Aviso geral */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="text-sm text-red-700 dark:text-red-400 leading-relaxed">
          <strong>{t('prohibited.warningLabel')}</strong> {t('prohibited.warningText')}
          {t('prohibited.warningAsk')}{' '}
          <a href="https://www.gov.br/receitafederal/pt-br" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
            {t('ui.receitaFederal')}
          </a>{' '}
          {t('prohibited.andThe')}{' '}
          <a href="https://www.post.japanpost.jp/int/restriction/index_en.html" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
            {t('prohibited.jpRestrictions')}
          </a>{t('prohibited.periodEnd')}
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`🔍  ${t('prohibited.searchPh')}`}
          className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      {/* Categorias */}
      {filtered.map((cat, i) => {
        const cfg = levelConfig[cat.level];
        const Icon = cfg.icon;
        const isOpen = search ? true : (open[i] ?? false);

        return (
          <div key={i} className={`rounded-xl border overflow-hidden ${cfg.bg} ${cfg.border}`}>
            {/* Header */}
            <button
              onClick={() => !search && toggle(i)}
              className={`w-full flex items-center justify-between px-5 py-4 ${cfg.header} text-left`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon}</span>
                <div>
                  <span className={`font-bold text-base ${cfg.title}`}>{cat.title}</span>
                  <span className={`ml-2 text-xs text-white px-2 py-0.5 rounded-full ${cfg.badge}`}>
                    {cat.items.length} {t('prohibited.items')}
                  </span>
                </div>
              </div>
              {!search && (
                isOpen
                  ? <ChevronUp className={`w-5 h-5 ${cfg.title}`} />
                  : <ChevronDown className={`w-5 h-5 ${cfg.title}`} />
              )}
            </button>

            {/* Items list */}
            {isOpen && (
              <div className="divide-y divide-border/50">
                {cat.items.map((item, j) => (
                  <div key={j} className="flex items-start gap-3 px-5 py-3">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                    <div className="text-sm">
                      <span className="font-semibold text-foreground">{item.name}</span>
                      {item.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Fonte */}
      <p className="text-xs text-muted-foreground text-center">
        {t('prohibited.sources')}
      </p>
    </div>
  );
};

export default ProhibitedItems;
