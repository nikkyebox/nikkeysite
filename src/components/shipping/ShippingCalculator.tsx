import React, { useState, useMemo, useEffect } from 'react';
import { Truck, Package, Calculator, MapPin, Scale } from 'lucide-react';
import { japanPrefectures } from '@/data/japanPrefectures';
import { useCart } from '@/context/CartContext';
import { convertYen as fxConvert } from '@/services/fxService';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { countryToZone, MAX_WEIGHT_G, MAX_DIM_SUM_CM, type JapanPostZone } from '@/utils/japanPostRates';
import { quoteShipping, spaceUsedOf } from '@/utils/shippingQuote';
import { effectiveYen } from '@/utils/pricing';

interface ShippingCalculatorProps {
  selectedPrefecture?: string;
  onShippingSelect?: (shipping: { carrier: string; cost: number; costYen: number; estimatedDays: string } | null) => void;
  destinationCountry?: string;
}

const ShippingCalculator: React.FC<ShippingCalculatorProps> = ({
  selectedPrefecture: externalPrefecture,
  onShippingSelect,
  destinationCountry = 'Brasil',
}) => {
  const [selectedPrefecture, setSelectedPrefecture] = useState<string>(externalPrefecture || '');
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);
  const { items } = useCart();
  const { t } = useLanguage();

  useEffect(() => {
    if (externalPrefecture) setSelectedPrefecture(externalPrefecture);
  }, [externalPrefecture]);

  useEffect(() => {
    setSelectedPrefecture('');
    setSelectedCarrier(null);
  }, [destinationCountry]);

  const spaceInfo = useMemo(() => spaceUsedOf(items), [items]);

  const isJapan = destinationCountry === 'Japão';
  const jpZone: JapanPostZone = countryToZone(destinationCountry || 'Brasil');
  // Moeda de exibição do frete conforme o país (BRL/EUR/USD/JPY)
  const destCurrency = getCurrencyByCountry(destinationCountry || 'Brasil');

  // Cotação: fonte única em utils/shippingQuote (mesma tabela e fórmula do servidor).
  const quote = useMemo(
    () => quoteShipping(items, destinationCountry || 'Brasil', { prefecture: selectedPrefecture }),
    [items, destinationCountry, selectedPrefecture]
  );
  const calculateBoxes = quote.boxes;

  const selectedPref = isJapan
    ? japanPrefectures.find(p => p.name === selectedPrefecture)
    : undefined;

  const displaySubtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      if (item.freeGift) return sum;
      return sum + fxConvert(effectiveYen(item.product, item.size), destCurrency) * item.quantity;
    }, 0);
  }, [items, destCurrency]);

  const shippingOptions = quote.options;

  useEffect(() => {
    if (onShippingSelect && selectedCarrier && shippingOptions.length > 0) {
      const selected = shippingOptions.find(opt => opt.carrier === selectedCarrier);
      if (selected) {
        onShippingSelect({ carrier: t(selected.nameKey), cost: selected.cost, costYen: selected.costYen ?? 0, estimatedDays: selected.estimatedDays });
      }
    } else if (onShippingSelect && !selectedCarrier) {
      onShippingSelect(null);
    }
  }, [selectedCarrier, shippingOptions, onShippingSelect, t]);

  const currency = destCurrency;

  const weightG = calculateBoxes.totalWeightG;
  const weightLabel = weightG >= 1000
    ? `${(weightG / 1000).toFixed(2).replace(/\.0+$/, '')} kg`
    : `${weightG} g`;
  const isOverweight = !isJapan && weightG > MAX_WEIGHT_G;
  const isOversize = !isJapan && calculateBoxes.maxPaddedDimensionSumCm > MAX_DIM_SUM_CM;

  return (
    <div className={cn("bg-card rounded-2xl border border-border p-6", !onShippingSelect && "lg:p-8")}>
      {!onShippingSelect && (
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Calculator className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="font-sans text-2xl font-bold text-foreground">
              {isJapan ? t('calc.domesticTitle') : t('calc.intlTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isJapan
                ? t('calc.fromHiroshima')
                : t('calc.directFrom').replace('{country}', destinationCountry || '')}
            </p>
          </div>
        </div>
      )}

      {/* Prefecture selector — Japan domestic only */}
      {isJapan && (
        <div className="mb-6">
          <label className="block text-sm font-bold text-foreground mb-2">
            <MapPin className="w-4 h-4 inline mr-1" />
            {t('calc.selectProvinceLabel')}
          </label>
          <select
            value={selectedPrefecture}
            onChange={(e) => { setSelectedPrefecture(e.target.value); setSelectedCarrier(null); }}
            disabled={!!externalPrefecture}
            className="w-full p-3 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <option value="">{t('calc.chooseProv')}</option>
            {japanPrefectures.map((pref) => (
              <option key={pref.name} value={pref.name}>
                {pref.nameJa} ({pref.name})
              </option>
            ))}
          </select>
        </div>
      )}

      {quote.unsupportedCountry && (
        <div className="mb-6 rounded-xl p-4 border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{t('shipping.unsupportedCountry')}</p>
        </div>
      )}

      {/* Japan Post international zone info */}
      {!isJapan && (
        <div className="mb-6 bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2">
            🗾 {t('calc.intlZone')} {jpZone}
            <span className="text-xs font-normal text-blue-600 dark:text-blue-400">
              — {destinationCountry}
            </span>
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            {t('calc.weightService')}
          </p>
        </div>
      )}

      {/* International shipping note */}
      {!isJapan && items.length > 0 && (
        <div className="bg-pink-50 dark:bg-pink-950/20 rounded-xl p-4 mb-6 border border-pink-200">
          <p className="text-xs text-pink-700 dark:text-pink-300 font-semibold leading-relaxed">
            {t('calc.intlNote').replace('{country}', destinationCountry || '')}
          </p>
        </div>
      )}

      {/* Overweight / oversize warnings */}
      {isOverweight && items.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-4 mb-6 border border-red-200">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">
            {t('calc.overweightWarning').replace('{weight}', weightLabel)}
          </p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">{t('calc.overweightContact')}</p>
        </div>
      )}
      {isOversize && items.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-4 mb-6 border border-red-200">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">
            {t('calc.oversizeWarning')}
          </p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">{t('calc.oversizeContact')}</p>
        </div>
      )}

      {/* Cart Summary */}
      {items.length > 0 && (
        <div className="bg-secondary/50 rounded-xl p-4 mb-6 border border-border">
          <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
            <Package className="w-4 h-4" />
            {t('calc.yourOrder')}
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('calc.standardItems')}</span>
              <span className="font-medium">{spaceInfo.small}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('calc.premiumItems')}</span>
              <span className="font-medium">{spaceInfo.large}</span>
            </div>
            <div className="border-t border-border pt-2 mt-2 space-y-1">
              {isJapan ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('calc.boxes60est')}</span>
                    <span className="font-medium">{calculateBoxes.boxes60}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('calc.boxes80est')}</span>
                    <span className="font-medium">{calculateBoxes.boxes80}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Scale className="w-3.5 h-3.5" /> {t('calc.estWeight')}
                  </span>
                  <span className="font-bold text-foreground">{weightLabel}</span>
                </div>
              )}
              {calculateBoxes.usedRealDimensions && (
                <div className="rounded-lg bg-background/70 border border-border p-2 text-[11px] text-muted-foreground leading-relaxed mt-1">
                  {t('calc.realDims').replace('{margin}', String(calculateBoxes.safetyMarginCm))}
                  {calculateBoxes.missingDimensionsCount > 0 && (
                    <span className="block text-amber-700 dark:text-amber-300">
                      {t('calc.missingDims').replace('{count}', String(calculateBoxes.missingDimensionsCount))}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="border-t border-border pt-2 mt-2">
              <div className="flex justify-between text-foreground font-bold">
                <span>{t('calc.subtotal')}</span>
                <span>{formatPrice(displaySubtotal, currency)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shipping Results */}
      {items.length > 0 && !isOverweight && !isOversize && shippingOptions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Truck className="w-4 h-4" />
            {onShippingSelect ? t('calc.selectDelivery') : t('calc.deliveryOptions')}
            {isJapan && selectedPrefecture && ` ${t('calc.forPref')} ${selectedPref?.nameJa}`}
          </h3>

          {isJapan && !selectedPrefecture && onShippingSelect && (
            <p className="text-sm text-muted-foreground mb-3">{t('calc.selectProvinceHint')}</p>
          )}

          {shippingOptions.map((option, index) => {
            const isConsultar = option.isConsultar;
            const isCombinar = option.isCombinar;
            // 'A Combinar' é selecionável (tem radio), apesar de não ter preço fixo
            const selectable = !isConsultar || isCombinar;
            return (
              <div
                key={option.carrier}
                onClick={() => onShippingSelect && selectable && setSelectedCarrier(option.carrier)}
                className={cn(
                  "rounded-xl p-4 border transition-all",
                  onShippingSelect && selectable ? "cursor-pointer" : "",
                  (isConsultar && !isCombinar) ? "border-dashed border-border opacity-70" :
                  selectedCarrier === option.carrier
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                    : onShippingSelect
                    ? "border-border hover:border-primary/50"
                    : index === 0 && !isCombinar
                    ? "border-primary bg-primary/5"
                    : isCombinar
                    ? "border-dashed border-amber-300"
                    : "border-border"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {onShippingSelect && selectable && (
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                        selectedCarrier === option.carrier ? "border-primary bg-primary" : "border-border"
                      )}>
                        {selectedCarrier === option.carrier && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    )}
                    <span className="text-2xl shrink-0">{option.logo}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-foreground truncate">{t(option.nameKey)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {option.costYen ? `¥${option.costYen.toLocaleString()} · ` : ''}
                        {isCombinar
                          ? t('calc.combinarDesc')
                          : isConsultar
                          ? t('calc.variableDeadline')
                          : t('calc.deliveryDays').replace('{days}', option.estimatedDays)}
                      </p>
                      {isCombinar && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 leading-tight">
                          ⚖️ {t('calc.combinarNote')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {isCombinar ? (
                      <p className="font-sans text-sm font-black text-amber-600 dark:text-amber-400">{t('calc.toBeAgreed')}</p>
                    ) : isConsultar ? (
                      <p className="font-sans text-sm font-black text-muted-foreground">{t('calc.consultar')}</p>
                    ) : (
                      <p className="font-sans text-lg font-black whitespace-nowrap text-primary">
                        {formatPrice(option.cost, currency, true)}
                      </p>
                    )}
                    {!onShippingSelect && !isConsultar && index === 0 && (
                      <span className="text-xs text-primary font-bold">{t('calc.bestOption')}</span>
                    )}
                    {selectedCarrier === option.carrier && !isConsultar && (
                      <span className="text-xs text-primary font-bold">{t('calc.selected')}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {!onShippingSelect && (() => {
            const best = shippingOptions.find(o => !('isConsultar' in o && o.isConsultar));
            if (!best) return null;
            return (
              <div className="bg-primary text-primary-foreground rounded-xl p-4 mt-4">
                <div className="flex justify-between items-center">
                  <span className="font-bold">{t('calc.totalBest')}</span>
                  <span className="font-sans text-2xl font-black">
                    {formatPrice(displaySubtotal + best.cost, currency)}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Needs prefecture selection (Japan) */}
      {isJapan && items.length > 0 && !selectedPrefecture && shippingOptions.length === 0 && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {t('calc.selectProvinceHint')}
        </div>
      )}

      {/* Empty cart */}
      {items.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50 text-pink-500" />
          <p>{t('calc.emptyCart')}</p>
        </div>
      )}
    </div>
  );
};

export default ShippingCalculator;
