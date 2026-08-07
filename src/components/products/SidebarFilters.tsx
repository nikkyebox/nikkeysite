import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import type { ProductCategory } from '@/services/categoryService';

interface SidebarFiltersProps {
  categories: ProductCategory[];
  types: string[];
  selectedCategory: string | null;
  selectedType: string | null;
  onCategoryChange: (id: string | null) => void;
  onTypeChange: (type: string | null) => void;
}

const SidebarFilters: React.FC<SidebarFiltersProps> = ({
  categories,
  types,
  selectedCategory,
  selectedType,
  onCategoryChange,
  onTypeChange,
}) => {
  const { t } = useLanguage();
  const [expandedSections, setExpandedSections] = React.useState({
    categories: true,
    types: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="space-y-6">
      {/* Categorias */}
      <div className="border-b border-border pb-6">
        <button
          onClick={() => toggleSection('categories')}
          className="flex items-center justify-between w-full text-lg font-bold mb-4 hover:text-primary transition-colors"
        >
          <span>{t('filter.categories') || 'Categorias'}</span>
          <ChevronDown
            className={cn(
              'w-5 h-5 transition-transform',
              expandedSections.categories ? '' : '-rotate-90'
            )}
          />
        </button>

        {expandedSections.categories && (
          <div className="space-y-2">
            <button
              onClick={() => onCategoryChange(null)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg transition-colors text-sm',
                selectedCategory === null
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              {t('filter.all') || 'Todos'}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg transition-colors text-sm',
                  selectedCategory === cat.id
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                )}
              >
                <span>{cat.icon} {cat.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tipos/Tags */}
      {types.length > 0 && (
        <div className="border-b border-border pb-6">
          <button
            onClick={() => toggleSection('types')}
            className="flex items-center justify-between w-full text-lg font-bold mb-4 hover:text-primary transition-colors"
          >
            <span>{t('filter.types') || 'Tipos'}</span>
            <ChevronDown
              className={cn(
                'w-5 h-5 transition-transform',
                expandedSections.types ? '' : '-rotate-90'
              )}
            />
          </button>

          {expandedSections.types && (
            <div className="space-y-2">
              <button
                onClick={() => onTypeChange(null)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg transition-colors text-sm',
                  selectedType === null
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                )}
              >
                {t('filter.all') || 'Todos'}
              </button>
              {types.map((type) => (
                <button
                  key={type}
                  onClick={() => onTypeChange(type)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg transition-colors text-sm',
                    selectedType === type
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clear Filters */}
      {(selectedCategory || selectedType) && (
        <Button
          onClick={() => {
            onCategoryChange(null);
            onTypeChange(null);
          }}
          variant="outline"
          className="w-full"
        >
          {t('filter.clear') || 'Limpar Filtros'}
        </Button>
      )}
    </div>
  );
};

export default SidebarFilters;
