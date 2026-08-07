import { packedWeightG } from '../../shared/weight.js';
import type { CartItem, ProductPackageDimensionsCm } from '@/types';

export const PACKAGE_SAFETY_MARGIN_CM = 5;

const BOX_VOLUME_CM3 = {
  60: Math.pow(60 / 3, 3),
  80: Math.pow(80 / 3, 3),
};

const PACKING_EFFICIENCY = 1;

export interface CartShippingBoxes {
  boxes60: number;
  boxes80: number;
  usedRealDimensions: boolean;
  missingDimensionsCount: number;
  itemsWithDimensions: number;
  safetyMarginCm: number;
  totalPaddedVolumeCm3: number;
  maxPaddedDimensionSumCm: number;
  oversizeCount: number;
  totalWeightG: number;
}

const emptyBoxes = (): CartShippingBoxes => ({
  boxes60: 0,
  boxes80: 0,
  usedRealDimensions: false,
  missingDimensionsCount: 0,
  itemsWithDimensions: 0,
  safetyMarginCm: PACKAGE_SAFETY_MARGIN_CM,
  totalPaddedVolumeCm3: 0,
  maxPaddedDimensionSumCm: 0,
  oversizeCount: 0,
  totalWeightG: 0,
});

export const sanitizePackageDimensions = (
  dimensions?: Partial<ProductPackageDimensionsCm> | null
): ProductPackageDimensionsCm | null => {
  if (!dimensions) return null;
  const widthCm = Number(dimensions.widthCm);
  const lengthCm = Number(dimensions.lengthCm);
  const heightCm = Number(dimensions.heightCm);

  // Cada lado deve ser plausível (0 < x <= 80cm). Acima disso é quase sempre
  // erro de cadastro (ex: mm digitado como cm) → descarta e usa o peso.
  if (![widthCm, lengthCm, heightCm].every((value) => Number.isFinite(value) && value > 0 && value <= 80)) {
    return null;
  }
  // Soma (com margem) não pode ultrapassar o limite do Japan Post (150cm),
  // senão o produto fica "oversize" e some o frete. Descarta se já estourar.
  if (widthCm + lengthCm + heightCm + 3 * PACKAGE_SAFETY_MARGIN_CM > 145) {
    return null;
  }

  return {
    widthCm,
    lengthCm,
    heightCm,
    ...(dimensions.source ? { source: dimensions.source } : {}),
    ...(dimensions.raw ? { raw: dimensions.raw } : {}),
  };
};

export const addSafetyMargin = (
  dimensions: ProductPackageDimensionsCm,
  marginCm = PACKAGE_SAFETY_MARGIN_CM
) => ({
  widthCm: dimensions.widthCm + marginCm,
  lengthCm: dimensions.lengthCm + marginCm,
  heightCm: dimensions.heightCm + marginCm,
});

export const fallbackBoxesFromSmallEquivalent = (totalSmallEquivalent: number): CartShippingBoxes => {
  const result = emptyBoxes();
  if (totalSmallEquivalent <= 0) return result;

  if (totalSmallEquivalent <= 4) result.boxes60 = 1;
  else if (totalSmallEquivalent <= 6) result.boxes80 = 1;
  else if (totalSmallEquivalent <= 8) result.boxes60 = 2;
  else {
    result.boxes80 = Math.floor(totalSmallEquivalent / 6);
    const remaining = totalSmallEquivalent % 6;
    result.boxes60 = remaining > 0 ? Math.ceil(remaining / 4) : 0;
  }

  return result;
};

const fallbackSmallEquivalentForItem = (item: CartItem): number =>
  item.size === 'small' ? item.quantity : item.quantity * 2;

export const calculateCartShippingBoxes = (
  items: CartItem[],
  fallbackSpaceInfo?: { totalSmallEquivalent: number }
): CartShippingBoxes => {
  if (items.length === 0) return emptyBoxes();

  // Peso pronto para envio: o mesmo padding de 200g vale para peso cadastrado
  // e estimado enquanto a unidade crua tiver menos de 2kg.
  let totalWeightG = 0;
  for (const item of items) {
    if (item.product.weightGrams && item.product.weightGrams > 0) {
      totalWeightG += packedWeightG(item.product.weightGrams) * item.quantity;
    } else {
      const dim = sanitizePackageDimensions(item.product.packageDimensionsCm);
      const estimatedWeight = dim
        ? dim.widthCm * dim.lengthCm * dim.heightCm * 0.25
        : item.size === 'small' ? 300 : 600;
      totalWeightG += packedWeightG(estimatedWeight) * item.quantity;
    }
  }
  totalWeightG = Math.max(100, Math.round(totalWeightG));

  let knownQuantity = 0;
  let missingQuantity = 0;
  let missingSmallEquivalent = 0;
  let totalPaddedVolumeCm3 = 0;
  let maxPaddedDimensionSumCm = 0;
  let oversizeCount = 0;

  for (const item of items) {
    const dimensions = sanitizePackageDimensions(item.product.packageDimensionsCm);
    if (!dimensions) {
      missingQuantity += item.quantity;
      missingSmallEquivalent += fallbackSmallEquivalentForItem(item);
      continue;
    }

    knownQuantity += item.quantity;
    const padded = addSafetyMargin(dimensions);
    const paddedSum = padded.widthCm + padded.lengthCm + padded.heightCm;
    const paddedVolume = padded.widthCm * padded.lengthCm * padded.heightCm;

    maxPaddedDimensionSumCm = Math.max(maxPaddedDimensionSumCm, paddedSum);
    totalPaddedVolumeCm3 += paddedVolume * item.quantity;
    if (paddedSum > 80) oversizeCount += item.quantity;
  }

  if (knownQuantity === 0) {
    const fallback = fallbackBoxesFromSmallEquivalent(fallbackSpaceInfo?.totalSmallEquivalent || missingSmallEquivalent);
    return { ...fallback, totalWeightG };
  }

  if (missingSmallEquivalent > 0) {
    totalPaddedVolumeCm3 += (BOX_VOLUME_CM3[60] / 4) * missingSmallEquivalent;
    maxPaddedDimensionSumCm = Math.max(maxPaddedDimensionSumCm, 60);
  }

  const result: CartShippingBoxes = {
    ...emptyBoxes(),
    usedRealDimensions: true,
    missingDimensionsCount: missingQuantity,
    itemsWithDimensions: knownQuantity,
    totalPaddedVolumeCm3,
    maxPaddedDimensionSumCm,
    oversizeCount,
    totalWeightG,
  };

  if (maxPaddedDimensionSumCm <= 60) {
    result.boxes60 = Math.max(1, Math.ceil(totalPaddedVolumeCm3 / (BOX_VOLUME_CM3[60] * PACKING_EFFICIENCY)));
    return result;
  }

  result.boxes80 = Math.max(1, Math.ceil(totalPaddedVolumeCm3 / (BOX_VOLUME_CM3[80] * PACKING_EFFICIENCY)));
  return result;
};
