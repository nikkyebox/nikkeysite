import React, { useState, useMemo, useEffect } from 'react';
import { Truck, Package, Calculator, MapPin, Scale } from 'lucide-react';
import { japanPrefectures, japanShippingRates } from '@/data/japanPrefectures';
import { useCart } from '@/context/CartContext';
import { convertYen as fxConvert } from '@/services/fxService';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { calculateCartShippingBoxes } from '@/utils/shippingDimensions';
import { getELightRate, getAirParcelRate, getEmsRate, countryToZone, MAX_WEIGHT_G, MAX_DIM_SUM_CM, type JapanPostZone } from '@/utils/japanPostRates';
import { effectiveYen } from '@/utils/pricing';

interface ShippingCalculatorProps {
  selectedPrefecture?: string;
  onShippingSelect?: (shipping: { carrier: string; cost: number; costYen: number; estimatedDays: string } | null) => void;
  destinationCountry?: string;
  couponDiscount?: number;
}

const ShippingCalculator: React.FC<ShippingCalculatorProps> = ({
  selectedPrefecture: externalPrefecture,
  onShippingSelect,
  destinationCountry = 'Brasil',
  couponDiscount = 0
}) => {
  const [selectedPrefecture, setSelectedPrefecture] = useState<string>(externalPrefecture || '');
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);
  const { getSpaceUsed, items } = useCart();
  const { t } = useLanguage();

  useEffect(() => {
    if (externalPrefecture) setSelectedPrefecture(externalPrefecture);
  }, [externalPrefecture]);

  useEffect(() => {
    setSelectedPrefecture('');
    setSelectedCarrier(null);
  }, [destinationCountry]);

  const spaceInfo = useMemo(() => getSpaceUsed(), [getSpaceUsed]);

  // Check if there are Custom Request items (Faça seu Pedido) in the cart
  const hasCustomRequest = items.some(item => item.product?.id?.includes('custom') || item.product?.category === 'custom-request');

  const isJapan = destinationCountry === 'Japão';
  const isEurope = ['Portugal', 'França', 'Itália', 'Espanha'].includes(destinationCountry || '');
  const jpZone: JapanPostZone = countryToZone(destinationCountry || 'Brasil');
  // Moeda de exibição do frete conforme o país (BRL/EUR/USD/JPY)
  const destCurrency = getCurrencyByCountry(destinationCountry || 'Brasil');

  const calculateBoxes = useMemo(
    () => calculateCartShippingBoxes(items, spaceInfo),
    [items, spaceInfo]
  );

  const selectedPref = isJapan
    ? japanPrefectures.find(p => p.name === selectedPrefecture)
    : undefined;

  const displaySubtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const unitPrice = fxConvert(effectiveYen(item.product, item.size), destCurrency);
      return sum + unitPrice * item.quantity;
    }, 0);
  }, [items, destCurrency]);

  const finalAmountForFreeShipping = displaySubtotal - couponDiscount;
  const isFreeShipping = isJapan && items.length > 0 && finalAmountForFreeShipping >= 6000;

  const shippingOptions = useMemo(() => {
    if (items.length === 0) return [];

    if (isJapan) {
      if (!selectedPref) return [];
      const zone = selectedPref.zone as 1 | 2 | 3 | 4;
      const carriers: ('yuubin' | 'yamato' | 'sagawa')[] = ['yuubin', 'yamato', 'sagawa'];
      const carrierNames = {
        yuubin: { name: 'Japan Post Local (ゆうパック) ✉️', logo: '📮' },
        yamato: { name: 'Yamato Transport (宅急便) 🐱', logo: '📦' },
        sagawa: { name: 'Sagawa Express (飛脚宅配便) 🏃‍♂️', logo: '⚡' }
      };
      const deliveryDays = { 1: '1-2', 2: '1-2', 3: '2-3', 4: '3-4' };

      return carriers.map(carrier => {
        let totalCost = 0;
        if (calculateBoxes.boxes60 > 0) totalCost += japanShippingRates[carrier]['60'][zone] * calculateBoxes.boxes60;
        if (calculateBoxes.boxes80 > 0) totalCost += japanShippingRates[carrier]['80'][zone] * calculateBoxes.boxes80;
        if (totalCost === 0) totalCost = japanShippingRates[carrier]['60'][zone];
        const cost = isFreeShipping ? 0 : totalCost;
        return {
          carrier,
          ...carrierNames[carrier],
          cost,
          costYen: null as number | null,
          originalCost: isFreeShipping ? totalCost : undefined,
          estimatedDays: deliveryDays[zone] || '2-3',
        };
      }).sort((a, b) => a.cost - b.cost);
    }

    // International — Japan Post weight-based
    const weightG = calculateBoxes.totalWeightG;
    if (weightG <= 0) return [];
    const currency = destCurrency;

    if (weightG > MAX_WEIGHT_G) return []; // overweight — handled in JSX

    // Prazo estimado por zona Japan Post (e-Light / Air / EMS)
    const daysByZone: Record<number, { light: string; air: string; ems: string }> = {
      1: { light: '6-10',  air: '4-7',   ems: '2-4'  }, // China/Coreia/Taiwan
      2: { light: '7-12',  air: '5-9',   ems: '3-5'  }, // Ásia
      3: { light: '7-14',  air: '6-10',  ems: '4-7'  }, // Europa/Oceania
      4: { light: '7-14',  air: '6-10',  ems: '3-6'  }, // EUA
      5: { light: '20-40', air: '10-15', ems: '18' }, // Brasil/Am.Sul/África
    };
    const zd = daysByZone[jpZone] || daysByZone[5];

    const options: Array<{
      carrier: string; name: string; logo: string;
      cost: number; costYen: number | null;
      originalCost: number | undefined; estimatedDays: string;
      isConsultar?: boolean;
    }> = [];

    if (weightG <= 2000) {
      const eLightYen = getELightRate(weightG, jpZone);
      if (eLightYen) options.push({
        carrier: 'eraito',
        name: 'Japan Post E-Light · 国際eパケットライト',
        logo: '📦',
        cost: fxConvert(eLightYen, currency),
        costYen: eLightYen,
        originalCost: undefined,
        estimatedDays: zd.light,
      });
    } else {
      const airYen = getAirParcelRate(weightG, jpZone);
      if (airYen) options.push({
        carrier: 'kozutsumi-air',
        name: 'Japan Post Kozutsumi Air · 国際小包 航空便',
        logo: '📦',
        cost: fxConvert(airYen, currency),
        costYen: airYen,
        originalCost: undefined,
        estimatedDays: zd.air,
      });
    }

    // EMS available for all weight classes
    const emsYen = getEmsRate(weightG, jpZone);
    if (emsYen) options.push({
      carrier: 'ems',
      name: 'Japan Post EMS · 国際スピード郵便 (via DHL)',
      logo: '✈️',
      cost: fxConvert(emsYen, currency),
      costYen: emsYen,
      originalCost: undefined,
      estimatedDays: zd.ems,
    });

    // Maritime — always show as "Consultar"
    options.push({
      carrier: 'maritimo',
      name: 'Sea Freight · 船便',
      logo: '🚢',
      cost: 0,
      costYen: null,
      originalCost: undefined,
      estimatedDays: '60-90',
      isConsultar: true,
    });

    // A combinar — frete calculado após pesagem real (only for custom requests)
    if (hasCustomRequest) {
      options.push({
        carrier: 'a-combinar',
        name: 'A Combinar · 要相談 (Apenas para encomendas fora do site)',
        logo: '⚖️',
        cost: 0,
        costYen: null,
        originalCost: undefined,
        estimatedDays: 'A definir',
        isConsultar: true,
        isCombinar: true,
      } as any);
    }

    return options.sort((a, b) => {
      if ((a as any).isCombinar) return 1;
      if ((b as any).isCombinar) return -1;
      if (a.isConsultar) return 1;
      if (b.isConsultar) return -1;
      return a.cost - b.cost;
    });
  }, [selectedPref, items, calculateBoxes, isJapan, jpZone, destCurrency, isFreeShipping]);

  useEffect(() => {
    if (onShippingSelect && selectedCarrier && shippingOptions.length > 0) {
      const selected = shippingOptions.find(opt => opt.carrier === selectedCarrier);
      if (selected) {
        onShippingSelect({ carrier: selected.name, cost: selected.cost, costYen: selected.costYen ?? 0, estimatedDays: selected.estimatedDays });
      }
    } else if (onShippingSelect && !selectedCarrier) {
      onShippingSelect(null);
    }
  }, [selectedCarrier, shippingOptions, onShippingSelect]);

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

      {/* Japan Post international zone info */}
      {!isJapan && (
        <div className="mb-6 bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2">
            🗾 Japan Post Internacional · Zona {jpZone}
            <span className="text-xs font-normal text-blue-600 dark:text-blue-400">
              — {destinationCountry}
            </span>
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            {t('calc.weightService')}
          </p>
        </div>
      )}

      {/* Free Shipping Banner */}
      {isFreeShipping && items.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 rounded-xl p-4 mb-6 border border-emerald-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🌸</span>
            <h3 className="font-bold text-emerald-800 dark:text-emerald-200">{t('calc.freeShippingBanner')}</h3>
          </div>
          <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
            {t('calc.freeShippingDesc')}
          </p>
        </div>
      )}

      {isJapan && items.length > 0 && !isFreeShipping && (
        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-4 mb-6 border border-amber-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🌸</span>
            <h3 className="font-bold text-amber-800 dark:text-amber-200">{t('calc.freeShippingThreshold')}</h3>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
            {t('calc.freeShippingRemain').replace('{amount}', formatPrice(6000 - finalAmountForFreeShipping, 'JPY'))}
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
                  Calculado com medidas reais de embalagem + margem de +{calculateBoxes.safetyMarginCm} cm.
                  {calculateBoxes.missingDimensionsCount > 0 && (
                    <span className="block text-amber-700 dark:text-amber-300">
                      {calculateBoxes.missingDimensionsCount} item(ns) sem medida real — peso estimado por padrão.
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
            {isJapan && selectedPrefecture && ` para ${selectedPref?.nameJa}`}
          </h3>

          {isJapan && !selectedPrefecture && onShippingSelect && (
            <p className="text-sm text-muted-foreground mb-3">{t('calc.selectProvinceHint')}</p>
          )}

          {shippingOptions.map((option, index) => {
            const isConsultar = (option as any).isConsultar;
            const isCombinar = (option as any).isCombinar;
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
                      <p className="font-bold text-sm text-foreground truncate">{option.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {option.costYen ? `¥${option.costYen.toLocaleString()} · ` : ''}
                        {isCombinar
                          ? 'Frete calculado após pesagem real do pacote'
                          : isConsultar
                          ? t('calc.variableDeadline')
                          : t('calc.deliveryDays').replace('{days}', option.estimatedDays)}
                      </p>
                      {isCombinar && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 leading-tight">
                          ⚖️ O valor será informado após a pesagem e cobrado separadamente.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {isCombinar ? (
                      <p className="font-sans text-sm font-black text-amber-600 dark:text-amber-400">A combinar</p>
                    ) : isConsultar ? (
                      <p className="font-sans text-sm font-black text-muted-foreground">{t('calc.consultar')}</p>
                    ) : (
                      <p className={cn(
                        "font-sans text-lg font-black whitespace-nowrap",
                        option.cost === 0 ? "text-green-600" : "text-primary"
                      )}>
                        {option.cost === 0 ? t('calc.gratis') : formatPrice(option.cost, currency, true)}
                      </p>
                    )}
                    {option.originalCost && option.originalCost > 0 && (
                      <p className="text-xs text-muted-foreground line-through whitespace-nowrap">{formatPrice(option.originalCost, currency, true)}</p>
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
            const best = shippingOptions.find(o => !(o as any).isConsultar);
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
