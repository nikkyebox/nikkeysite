import { describe, expect, it } from 'vitest';
import type { CartItem, Product } from '@/types';
import {
  calculateCartShippingBoxes,
  PACKAGE_SAFETY_MARGIN_CM,
  sanitizePackageDimensions,
} from './shippingDimensions';

const product = (packageDimensionsCm?: Product['packageDimensionsCm']): Product => ({
  id: 'p1',
  name: 'Test Product',
  description: '',
  category: 'test',
  prices: { small: 100, large: 100 },
  image: '',
  flavor: '',
  packageDimensionsCm,
});

const item = (p: Product, quantity = 1, size = 'small'): CartItem => ({
  product: p,
  quantity,
  size,
});

describe('shippingDimensions', () => {
  it('applies +5cm safety margin to each dimension before choosing box size', () => {
    const boxes = calculateCartShippingBoxes([
      item(product({ widthCm: 20, lengthCm: 25, heightCm: 20, source: 'yahoo' })),
    ]);

    expect(PACKAGE_SAFETY_MARGIN_CM).toBe(5);
    expect(boxes.usedRealDimensions).toBe(true);
    expect(boxes.maxPaddedDimensionSumCm).toBe(80);
    expect(boxes.boxes60).toBe(0);
    expect(boxes.boxes80).toBe(1);
  });

  it('uses one 60cm box when padded dimension sum remains within 60cm', () => {
    const boxes = calculateCartShippingBoxes([
      item(product({ widthCm: 10, lengthCm: 20, heightCm: 5, source: 'manual' })),
    ]);

    expect(boxes.maxPaddedDimensionSumCm).toBe(50);
    expect(boxes.boxes60).toBe(1);
    expect(boxes.boxes80).toBe(0);
  });

  it('falls back to the previous small-equivalent rule when dimensions are missing', () => {
    const boxes = calculateCartShippingBoxes([item(product(), 5)], { totalSmallEquivalent: 5 });

    expect(boxes.usedRealDimensions).toBe(false);
    expect(boxes.boxes60).toBe(0);
    expect(boxes.boxes80).toBe(1);
  });

  it('rejects invalid dimensions', () => {
    expect(sanitizePackageDimensions({ widthCm: 0, lengthCm: 10, heightCm: 10 })).toBeNull();
    expect(sanitizePackageDimensions({ widthCm: 10, lengthCm: 10, heightCm: 10 })?.widthCm).toBe(10);
  });
});
