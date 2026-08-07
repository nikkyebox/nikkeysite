import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Truck, Clock, Shield, ArrowRight, HelpCircle, Info, Landmark, Percent, Calculator, Weight, Box, AlertTriangle } from 'lucide-react';
import ProhibitedItems from '@/components/shipping/ProhibitedItems';
import Layout from '@/components/layout/Layout';
import ShippingCalculator from '@/components/shipping/ShippingCalculator';
import { Button } from '@/components/ui/button';
import { useLanguage, CountryType } from '@/context/LanguageContext';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { getELightRate, getAirParcelRate, getEmsRate, countryToZone, MAX_DIM_SUM_CM, MAX_WEIGHT_G, type JapanPostZone } from '@/utils/japanPostRates';
import { convertYen as fxConvert } from '@/services/fxService';
import { cn } from '@/lib/utils';

const Shipping: React.FC = () => {
  const { t, selectedCountry, language } = useLanguage();
  const [country, setCountry] = useState<CountryType>(selectedCountry);
  const [activeSection, setActiveSection] = useState<'rates' | 'prohibited'>('rates');

  // Simulator state (typed string inputs for smooth deletion and no spinner jumping)
  const [simValueInput, setSimValueInput] = useState<string>('150');
  const [simHeightInput, setSimHeightInput] = useState<string>('20');
  const [simWidthInput, setSimWidthInput] = useState<string>('20');
  const [simDepthInput, setSimDepthInput] = useState<string>('20');
  const [simWeightInput, setSimWeightInput] = useState<string>('1.5');

  // Sync with global country context selection
  useEffect(() => {
    setCountry(selectedCountry);
  }, [selectedCountry]);

  // Adjust simulator defaults when country changes to avoid mismatched currencies
  useEffect(() => {
    if (country === 'Japão') {
      setSimValueInput('4500'); // 4500 JPY
    } else if (['Portugal', 'França', 'Itália', 'Espanha'].includes(country)) {
      setSimValueInput('25'); // 25 EUR
    } else {
      setSimValueInput('150'); // 150 BRL
    }
  }, [country]);

  // Parse inputs to numbers for calculations
  const simValue = parseFloat(simValueInput) || 0;
  const simHeight = parseFloat(simHeightInput) || 0;
  const simWidth = parseFloat(simWidthInput) || 0;
  const simDepth = parseFloat(simDepthInput) || 0;
  const simWeight = parseFloat(simWeightInput) || 0;

  // Calculations for dynamic simulator
  const simVolume = (simHeight * simWidth * simDepth) / 1000000; // Volume in m³
  const volumetricWeight = simVolume * 200; // Volumetric constant: 1m3 = 200kg (standards)
  const billableWeight = Math.max(simWeight, volumetricWeight);
  const dimensionSum = simHeight + simWidth + simDepth;

  const isOversize = dimensionSum > MAX_DIM_SUM_CM;
  const isWeightExceeded = simWeight > MAX_WEIGHT_G / 1000; // 30kg

  const setBoxPreset = (h: number, w: number, d: number) => {
    setSimHeightInput(h.toString());
    setSimWidthInput(w.toString());
    setSimDepthInput(d.toString());
  };

  const getSimulatorRates = () => {
    if (country === 'Japão') {
      return [
        { name: 'Japan Post Local (ゆうパック) 📮', cost: 700 + 150 * billableWeight, time: language === 'ja' ? '1-2日' : '1-2 days' },
        { name: 'Yamato Transport (宅急便) 🐱', cost: 800 + 180 * billableWeight, time: language === 'ja' ? '1-2日' : '1-2 days' },
        { name: 'Sagawa Express (飛脚宅配便) 🏃', cost: 750 + 160 * billableWeight, time: language === 'ja' ? '1-2日' : '1-2 days' }
      ];
    }

    const zone: JapanPostZone = countryToZone(country);
    const cur = getCurrencyByCountry(country);
    const billableWeightG = Math.max(1, Math.round(billableWeight * 1000));

    // Unidade de prazo conforme idioma
    const du = language === 'ja' ? '営業日' : language === 'en' ? 'business days' : 'dias úteis';
    // Prazo estimado por zona Japan Post (só números; unidade adicionada abaixo)
    const daysByZone: Record<number, { light: string; air: string; ems: string }> = {
      1: { light: '6-10',  air: '4-7',   ems: '2-4'  },
      2: { light: '7-12',  air: '5-9',   ems: '3-5'  },
      3: { light: '7-14',  air: '6-10',  ems: '4-7'  },
      4: { light: '7-14',  air: '6-10',  ems: '3-6'  },
      5: { light: '20-40', air: '10-15', ems: '18'   },
    };
    const zd = daysByZone[zone] || daysByZone[5];

    type SimRate = { name: string; cost: number | null; time: string; consultar?: boolean; combinar?: boolean };
    type SampleRate = { name: string; logo: string; desc: string; rate60: number; rate80: number; time: string; features: string[]; consultar?: boolean; combinar?: boolean };
    const rates: SimRate[] = [];
    if (billableWeightG <= 2000) {
      const yen = getELightRate(billableWeightG, zone);
      rates.push({ name: 'Japan Post E-Light ✉️', cost: yen ? fxConvert(yen, cur) : null, time: `${zd.light} ${du}` });
    } else {
      const airYen = getAirParcelRate(billableWeightG, zone);
      rates.push({ name: 'Japan Post Kozutsumi Air 📦', cost: airYen ? fxConvert(airYen, cur) : null, time: `${zd.air} ${du}` });
    }

    const emsYen = getEmsRate(billableWeightG, zone);
    rates.push({ name: 'Japan Post EMS / DHL ✈️', cost: emsYen ? fxConvert(emsYen, cur) : null, time: `${zd.ems} ${du}` });
    const seaTime = language === 'ja' ? '60-90日' : language === 'en' ? '60-90 days' : '60-90 dias';
    const tbdTime = language === 'ja' ? '要相談' : language === 'en' ? 'TBD' : 'A definir';
    rates.push({ name: 'Sea Freight 🚢', cost: null, time: seaTime, consultar: true });
    rates.push({ name: 'A Combinar ⚖️', cost: null, time: tbdTime, consultar: true, combinar: true });

    return rates;
  };

  const getSimulatorTax = () => {
    if (country === 'Brasil') {
      // Brazil import taxes determined by customs authorities — not reliably estimated
      return { total: 0, label: '' };
    }
    
    const vatRates: Record<string, { rate: number; label: string }> = {
      Portugal: { rate: 0.23, label: 'IVA Portugal (23%)' },
      França: { rate: 0.20, label: 'TVA França (20%)' },
      Itália: { rate: 0.22, label: 'IVA Itália (22%)' },
      Espanha: { rate: 0.21, label: 'IVA Espanha (21%)' }
    };

    if (vatRates[country]) {
      return {
        total: simValue * vatRates[country].rate,
        label: vatRates[country].label
      };
    }

    return { total: 0, label: 'Isento' };
  };

  const simRates = getSimulatorRates();
  const simTax = getSimulatorTax();

  // Sample rates data based on files (for Zone 1 / Major Cities as reference)
  const getSampleRates = () => {
    if (country === 'Japão') {
      return [
        {
          name: 'Japan Post Local (ゆうパック) ✉️',
          logo: '📮',
          desc: t('shippingPage.carrier.jp.desc'),
          rate60: 870,
          rate80: 1100,
          time: language === 'ja' ? '1-2営業日' : '1-2 business days',
          features: ['Rastreamento completo', 'Entrega aos sábados/domingos', 'Seguro básico']
        },
        {
          name: 'Yamato Transport (宅急便) 🐱',
          logo: '📦',
          desc: t('shippingPage.carrier.yamato.desc'),
          rate60: 930,
          rate80: 1150,
          time: language === 'ja' ? '1-2営業日' : '1-2 business days',
          features: ['Horários selecionáveis', 'Entrega rápida', 'Alta confiabilidade']
        },
        {
          name: 'Sagawa Express (飛脚宅配便) 🏃‍♂️',
          logo: '🏃‍♂️',
          desc: t('shippingPage.carrier.sagawa.desc'),
          rate60: 880,
          rate80: 1100,
          time: language === 'ja' ? '1-2営業日' : '1-2 business days',
          features: ['Rastreável online', 'Suporte local excelente', 'Rede expressa']
        }
      ];
    }

    if (['Portugal', 'França', 'Itália', 'Espanha'].includes(country)) {
      const eurELight1kg = fxConvert(getELightRate(1000, 3) ?? 2500, 'EUR');
      const eurELight2kg = fxConvert(getELightRate(2000, 3) ?? 4300, 'EUR');
      const eurEms1kg  = fxConvert(getEmsRate(1000, 3) ?? 4000, 'EUR');
      const eurEms3kg  = fxConvert(getEmsRate(3000, 3) ?? 6600, 'EUR');
      const eurAir3kg  = fxConvert(getAirParcelRate(3000, 3) ?? 8150, 'EUR');
      const eurAir5kg  = fxConvert(getAirParcelRate(5000, 3) ?? 12450, 'EUR');
      return [
        {
          name: 'Japan Post E-Light ✉️',
          logo: '✉️',
          desc: t('shippingPage.carrier.elight.desc'),
          rate60: eurELight1kg,
          rate80: eurELight2kg,
          time: '7-12 days',
          features: ['Até 2 kg', 'Rastreio básico', 'Mais acessível']
        },
        {
          name: 'Japan Post EMS / DHL ✈️',
          logo: '✈️',
          desc: t('shippingPage.carrier.ems.desc'),
          rate60: eurEms1kg,
          rate80: eurEms3kg,
          time: '5-8 days',
          features: ['Despacho prioritário Narita', 'Rastreio em tempo real', 'Trânsito aéreo expresso']
        },
        {
          name: 'Japan Post Kozutsumi Air 📦',
          logo: '📦',
          desc: t('shippingPage.carrier.kozutsumi.desc'),
          rate60: eurAir3kg,
          rate80: eurAir5kg,
          time: '7-10 days',
          features: ['Até 30 kg', 'Rastreio completo', 'Ótimo custo-benefício']
        },
        {
          name: 'Sea Freight 🚢',
          logo: '🚢',
          desc: t('shippingPage.carrier.sea.desc'),
          rate60: null as unknown as number,
          rate80: null as unknown as number,
          time: '60-90 days',
          features: ['Custo baixo', 'Ideal para volumes grandes', 'Consultar disponibilidade'],
          consultar: true
        }
      ];
    }

    // Brasil — preços calculados com tabelas reais Japan Post (zona 5)
    // Referência: E-Light 1kg / 2kg, EMS 1kg / 3kg, Kozutsumi Air 3kg / 5kg
    const brlELight1kg = fxConvert(getELightRate(1000, 5) ?? 3260, 'BRL');
    const brlELight2kg = fxConvert(getELightRate(2000, 5) ?? 5860, 'BRL');
    const brlEms1kg  = fxConvert(getEmsRate(1000, 5) ?? 4700, 'BRL');
    const brlEms3kg  = fxConvert(getEmsRate(3000, 5) ?? 7800, 'BRL');
    const brlAir3kg  = fxConvert(getAirParcelRate(3000, 5) ?? 9950, 'BRL');
    const brlAir5kg  = fxConvert(getAirParcelRate(5000, 5) ?? 15350, 'BRL');
    const du = language === 'ja' ? '営業日' : language === 'en' ? 'business days' : 'dias úteis';
    const seaTime = language === 'ja' ? '60-90日' : language === 'en' ? '60-90 days' : '60-90 dias';
    const tbdTime = language === 'ja' ? '要相談' : language === 'en' ? 'TBD' : 'A definir';
    return [
      {
        name: 'Japan Post E-Light ✉️',
        logo: '✉️',
        desc: t('shippingPage.carrier.elight.desc'),
        rate60: brlELight1kg,
        rate80: brlELight2kg,
        time: `20-40 ${du}`,
        features: ['Até 2 kg', 'Rastreio básico', 'Mais acessível']
      },
      {
        name: 'Japan Post EMS / DHL ✈️',
        logo: '✈️',
        desc: t('shippingPage.carrier.ems.desc'),
        rate60: brlEms1kg,
        rate80: brlEms3kg,
        time: `18 ${du}`,
        features: ['Prioridade na aduana', 'Rastreio em tempo real', 'Despacho rápido']
      },
      {
        name: 'Japan Post Kozutsumi Air 📦',
        logo: '📦',
        desc: t('shippingPage.carrier.kozutsumi.desc'),
        rate60: brlAir3kg,
        rate80: brlAir5kg,
        time: `10-15 ${du}`,
        features: ['Até 30 kg', 'Rastreio completo', 'Ótimo custo-benefício']
      },
      {
        name: 'Sea Freight 🚢',
        logo: '🚢',
        desc: t('shippingPage.carrier.sea.desc'),
        rate60: null as unknown as number,
        rate80: null as unknown as number,
        time: seaTime,
        features: ['Custo baixo', 'Ideal para volumes grandes', 'Consultar disponibilidade'],
        consultar: true
      },
      {
        name: 'A Combinar ⚖️',
        logo: '⚖️',
        desc: 'Frete calculado após pesagem real do pacote — valor cobrado separadamente.',
        rate60: null as unknown as number,
        rate80: null as unknown as number,
        time: tbdTime,
        features: ['Produtos acrescentados depois', 'Pesagem na finalização', 'Cobrado à parte'],
        consultar: true,
        combinar: true,
      }
    ];
  };

  const sampleRates = getSampleRates();
  const currency = getCurrencyByCountry(country);

  return (
    <Layout>
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {t('shippingPage.title')}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t('shippingPage.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-6xl">

          {/* Tab selector */}
          <div className="flex gap-2 mb-8 bg-secondary/50 rounded-xl p-1.5 w-fit">
            <button
              onClick={() => setActiveSection('rates')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeSection === 'rates' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Truck className="w-4 h-4" /> {t('shippingPage.tabRates')}
            </button>
            <button
              onClick={() => setActiveSection('prohibited')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeSection === 'prohibited' ? 'bg-card shadow text-red-600' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <AlertTriangle className="w-4 h-4" /> {t('shippingPage.tabProhibited')}
            </button>
          </div>

          {activeSection === 'prohibited' ? (
            <ProhibitedItems />
          ) : (<>

          {/* Country Selection Dropdown */}
          <div className="bg-card rounded-2xl border border-border p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div>
              <h3 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                {t('shippingPage.simulatorTitle')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('shippingPage.simulatorDesc')}
              </p>
            </div>
            <div className="min-w-[240px]">
              <select
                id="country-selector"
                value={country}
                onChange={(e) => setCountry(e.target.value as CountryType)}
                className="w-full p-3 rounded-xl border border-border bg-background text-foreground font-semibold focus:ring-2 focus:ring-primary transition-all text-sm cursor-pointer"
              >
                <option value="Brasil">Brasil 🇧🇷</option>
                <option value="Portugal">Portugal 🇵🇹</option>
                <option value="França">França 🇫🇷</option>
                <option value="Itália">Itália 🇮🇹</option>
                <option value="Espanha">Espanha 🇪🇸</option>
                <option value="Japão">Japão 🇯🇵</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start min-w-0">

            {/* Left Column: Interactive Shipping Calculator & Advanced Simulator */}
            <div className="lg:col-span-3 space-y-8 min-w-0">
              
              {/* Box Shipping Calculator */}
              <ShippingCalculator destinationCountry={country} />
              
              {/* Advanced Interactive Simulator Widget */}
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-sans text-lg font-bold text-foreground">
                      {t('shippingPage.dimSim')}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {t('shippingPage.dimSimSub')}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Row 1: Declared Value & Weight */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                        {t('shippingPage.declaredValue').replace('{currency}', currency)}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={simValueInput}
                        onChange={(e) => setSimValueInput(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground text-sm font-semibold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <Weight className="w-3.5 h-3.5 text-primary" /> {t('shippingPage.physicalWeight')}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={simWeightInput}
                        onChange={(e) => setSimWeightInput(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground text-sm font-semibold"
                      />
                    </div>
                  </div>

                  {/* Row 2: Box Dimensions in cm */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                      <Box className="w-3.5 h-3.5 text-primary" /> {t('shippingPage.boxDimensions')}
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground font-semibold">{t('shippingPage.height')}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={simHeightInput}
                          onChange={(e) => setSimHeightInput(e.target.value.replace(/[^0-9.]/g, ''))}
                          className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground text-sm font-semibold text-center"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground font-semibold">{t('shippingPage.width')}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={simWidthInput}
                          onChange={(e) => setSimWidthInput(e.target.value.replace(/[^0-9.]/g, ''))}
                          className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground text-sm font-semibold text-center"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground font-semibold">{t('shippingPage.depth')}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={simDepthInput}
                          onChange={(e) => setSimDepthInput(e.target.value.replace(/[^0-9.]/g, ''))}
                          className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground text-sm font-semibold text-center"
                        />
                      </div>
                    </div>

                    {/* Presets and linear sum */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setBoxPreset(20, 20, 20)}
                          className="text-[9px] bg-secondary hover:bg-secondary/80 px-2 py-1 rounded text-muted-foreground hover:text-foreground font-semibold"
                        >
                          {t('shippingPage.box60only')} (20x20x20)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBoxPreset(30, 25, 25)}
                          className="text-[9px] bg-secondary hover:bg-secondary/80 px-2 py-1 rounded text-muted-foreground hover:text-foreground font-semibold"
                        >
                          {t('shippingPage.box80only')} (30x25x25)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBoxPreset(40, 30, 30)}
                          className="text-[9px] bg-secondary hover:bg-secondary/80 px-2 py-1 rounded text-muted-foreground hover:text-foreground font-semibold"
                        >
                          Box 100 (40x30x30)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dimension/Weight limit warnings */}
                {isOversize && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-xl p-4 text-xs text-red-800 dark:text-red-300 font-semibold space-y-1">
                    <p className="flex items-center gap-1.5 font-bold text-red-600">
                      {t('shippingPage.oversizeTitle')}
                    </p>
                    <p className="leading-relaxed">
                      {t('shippingPage.oversizeDesc').replace('{sum}', String(dimensionSum))}
                    </p>
                  </div>
                )}
                {!isOversize && isWeightExceeded && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-xl p-4 text-xs text-red-800 dark:text-red-300 font-semibold space-y-1">
                    <p className="flex items-center gap-1.5 font-bold text-red-600">
                      {t('shippingPage.weightTitle')}
                    </p>
                    <p className="leading-relaxed">
                      {t('shippingPage.weightDesc').replace('{weight}', String(simWeight))}
                    </p>
                  </div>
                )}

                {/* Calculation Info */}
                <div className="bg-secondary/40 p-3.5 rounded-xl border border-border/80 text-xs text-muted-foreground space-y-1.5">
                  <div className="flex justify-between">
                    <span>{t('shippingPage.dimSum')}</span>
                    <span className="font-bold text-foreground">{dimensionSum} cm</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('shippingPage.volumeResult')}</span>
                    <span className="font-semibold text-foreground">{simVolume.toFixed(6)} m³</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('shippingPage.volumetricWeight')}</span>
                    <span className="font-semibold text-foreground">{volumetricWeight.toFixed(2)} kg</span>
                  </div>
                  <div className="flex justify-between border-t border-border/50 pt-1.5 mt-1 font-bold">
                    <span className="text-foreground">{t('shippingPage.taxableWeight')}:</span>
                    <span className="text-primary">{billableWeight.toFixed(2)} kg</span>
                  </div>
                </div>

                {/* Simulator Results */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">{t('shippingPage.freightCost')}</h4>
                  {(isOversize || isWeightExceeded) ? (
                    <div className="p-6 bg-red-50/20 rounded-xl border border-dashed border-red-200 text-center text-xs text-red-700 dark:text-red-400 font-semibold">
                      {t('shippingPage.calcSuspended')}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {simRates.map((rate) => (
                        <div key={rate.name} className="p-3 bg-secondary/20 rounded-xl border border-border text-center flex flex-col justify-between">
                          <span className="text-[10px] text-muted-foreground block truncate font-bold">{rate.name}</span>
                          {rate.combinar ? (
                            <span className="text-sm font-black text-amber-600 dark:text-amber-400 block mt-1">A combinar</span>
                          ) : rate.consultar || rate.cost === null ? (
                            <span className="text-sm font-black text-muted-foreground block mt-1">{t('shippingPage.consultar')}</span>
                          ) : (
                            <span className="text-base font-black text-primary block mt-1">{formatPrice(rate.cost as number, currency)}</span>
                          )}
                          <span className="text-[9px] text-muted-foreground block mt-0.5">{t('shippingPage.deadline')} {rate.time}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Simulated Tax Result */}
                {country !== 'Japão' && simTax.total > 0 && (
                  <div className="bg-pink-50/50 dark:bg-pink-950/20 border border-pink-200 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center text-sm font-bold text-orange-850 dark:text-pink-300">
                      <span className="flex items-center gap-1.5">
                        <Percent className="w-4 h-4" />
                        {t('shippingPage.customsEst')} ({simTax.label})
                      </span>
                      <span>{formatPrice(simTax.total, currency)}</span>
                    </div>
                    <p className="text-[10px] text-pink-700 dark:text-pink-400 leading-relaxed font-semibold">
                      ⚠️ {t('shippingPage.notaFiscal')}
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 bg-secondary/50 rounded-xl border border-border flex items-start gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>{t('shippingPage.freeTip')}:</strong> {t('shippingPage.freeTipDesc')}
                  </p>
                  <Button asChild variant="link" className="mt-1.5 p-0 h-auto text-primary text-xs font-bold">
                    <Link to="/produtos" className="flex items-center gap-1">
                      {t('shippingPage.viewCatalog')}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Column: Dynamic Rates & Taxes */}
            <div className="lg:col-span-2 space-y-6 min-w-0">

              {/* Dynamic Impostos (Taxes) Card */}
              <div className="p-6 rounded-2xl bg-primary/5 border border-primary/20 space-y-4">
                <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2 border-b border-primary/10 pb-3">
                  <Percent className="w-5 h-5 text-primary animate-pulse" />
                  {t('shippingPage.customs')} ({country})
                </h3>
                
                {country === 'Brasil' && (
                  <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg p-3 text-amber-800 dark:text-amber-200 font-medium">
                      ⚠️ <strong>Aviso sobre Tributação</strong>
                    </div>
                    <p>
                      Produtos enviados do Japão podem estar sujeitos a tributos, taxas e inspeção alfandegária definidos pelas autoridades do país de destino. Valores eventualmente exibidos são estimativas e não garantem cobrança final nem prazo de liberação.
                    </p>
                  </div>
                )}

                {['Portugal', 'França', 'Itália', 'Espanha'].includes(country) && (
                  <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded-lg p-3 text-blue-800 dark:text-blue-200 font-medium">
                      ℹ️ <strong>European Air Import (DDU/DAP)</strong>
                    </div>
                    <p>
                      We do not charge European import taxes (VAT or local customs duties) at checkout. Your package is shipped from Japan as a standard international postal shipment.
                    </p>
                    <div className="border-t border-primary/10 pt-2.5 space-y-2">
                      <div className="flex justify-between font-bold text-foreground">
                        <span>Tax at Checkout:</span>
                        <span className="text-green-600">€ 0.00</span>
                      </div>
                      <p className="text-[10px] pl-2 border-l-2 border-border">
                        You pay only the product price and shipping from Hiroshima on our site.
                      </p>

                      <div className="flex justify-between font-bold text-foreground">
                        <span>Local Customs Tax:</span>
                        <span className="text-blue-600">VAT + Postal Fees</span>
                      </div>
                      <p className="text-[10px] pl-2 border-l-2 border-border">
                        Upon arrival at European customs, the package may be subject to local VAT (e.g. 23% in Portugal, 20% in France) and local postal handling fees payable by the recipient.
                      </p>
                    </div>
                  </div>
                )}

                {country === 'Japão' && (
                  <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 rounded-lg p-3 text-emerald-800 dark:text-emerald-200 font-medium">
                      ✓ <strong>国内発送（輸入税免除）/ Domestic Shipping (Import Tax Exempt)</strong>
                    </div>
                    <p>
                      国内発送のため（広島の店舗から発送）、輸入関税や通関手続きは一切ありません。<br />
                      <span className="text-muted-foreground">Domestic shipment from our Hiroshima store — no customs or international import taxes.</span>
                    </p>
                    <div className="border-t border-primary/10 pt-2.5 space-y-2">
                      <div className="flex justify-between font-bold text-foreground">
                        <span>輸入税 / Import Tax:</span>
                        <span className="text-green-600">免除 / Exempt (¥0)</span>
                      </div>

                      <div className="flex justify-between font-bold text-foreground">
                        <span>消費税 (消費税 10%) / Consumption Tax:</span>
                        <span className="text-emerald-600">含む / Included (10%)</span>
                      </div>
                      <p className="text-[10px] pl-2 border-l-2 border-border">
                        Japanese 10% consumption tax is already fully included in all product prices.
                      </p>

                      <div className="flex justify-between font-bold text-foreground">
                        <span>送料無料 / Free Shipping:</span>
                        <span className="text-emerald-600">利用可 / Available</span>
                      </div>
                      <p className="text-[10px] pl-2 border-l-2 border-border">
                        Free domestic shipping in Japan for orders over ¥6,000 at NikkeyBox!
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Carrier & Box Table */}
              <div className="space-y-4">
                <h3 className="font-display text-lg font-bold text-foreground">
                  {t('shippingPage.sampleRates')} ({country})
                </h3>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {t('shippingPage.sampleNote')}
                </p>
                <div className="space-y-3">
                  {sampleRates.map((carrier) => (
                    <div key={carrier.name} className="p-4 rounded-xl bg-card border border-border space-y-3 hover:border-primary/50 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{carrier.logo}</span>
                          <div>
                            <h4 className="font-bold text-sm text-foreground leading-snug">{carrier.name}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">{carrier.desc}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-border/80 text-xs">
                        <div className="bg-secondary/40 p-2 rounded-lg text-center">
                          <span className="text-muted-foreground block text-[10px]">{carrier.consultar ? t('shippingPage.box60only') : t('shippingPage.avgBox60')}</span>
                          <span className={cn("font-sans font-black text-sm", carrier.combinar ? "text-amber-600 dark:text-amber-400" : "text-primary")}>
                            {carrier.combinar ? 'A combinar' : carrier.consultar ? t('shippingPage.consultar') : formatPrice(carrier.rate60, currency)}
                          </span>
                        </div>
                        <div className="bg-secondary/40 p-2 rounded-lg text-center">
                          <span className="text-muted-foreground block text-[10px]">{carrier.consultar ? t('shippingPage.box80only') : t('shippingPage.avgBox80')}</span>
                          <span className={cn("font-sans font-black text-sm", carrier.combinar ? "text-amber-600 dark:text-amber-400" : "text-primary")}>
                            {carrier.combinar ? 'A combinar' : carrier.consultar ? t('shippingPage.consultar') : formatPrice(carrier.rate80, currency)}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                        {t('shippingPage.estDeadline')} <span className="font-semibold text-foreground">{carrier.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>

          </>)}

        </div>
      </section>
    </Layout>
  );
};

export default Shipping;
