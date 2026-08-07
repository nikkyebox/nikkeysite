import type { ShippingLabelData } from '@/types/order';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


interface TrackingInfo {
  trackingNumber: string;
  carrier: string;
  status: string;
  estimatedDelivery?: string;
}

interface TrackingEvent {
  date: string;
  status: string;
  location: string;
}

interface TrackingDetails {
  trackingNumber: string;
  carrier: string;
  status: string;
  events: TrackingEvent[];
}

export const carrierService = {
  /**
   * Create shipping label with Japan Post
   */
  createJapanPostLabel: async (data: ShippingLabelData): Promise<TrackingInfo> => {
    devLog('📮 Japan Post API - Creating shipping label');
    devLog('Order:', data.orderNumber);
    devLog('From:', data.sender.name, data.sender.postalCode);
    devLog('To:', data.recipient.name, data.recipient.postalCode);
    
    // Mock API call
    try {
      // const response = await fetch(`${import.meta.env.VITE_API_URL}/carriers/japan-post/create-label`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${import.meta.env.VITE_JAPAN_POST_API_KEY}`
      //   },
      //   body: JSON.stringify(data)
      // });
      // const result = await response.json();
      // return result;

      devLog('✅ Label created (backend integration required)');
      return {
        trackingNumber: `JP${Date.now().toString().slice(-10)}`,
        carrier: 'Japan Post',
        status: 'label_created',
        estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
      };
    } catch (error) {
      devError('❌ Error creating Japan Post label:', error);
      throw error;
    }
  },

  /**
   * Create shipping label with Yamato
   */
  createYamatoLabel: async (data: ShippingLabelData): Promise<TrackingInfo> => {
    devLog('🐱 Yamato API - Creating shipping label');
    devLog('Order:', data.orderNumber);
    
    // Mock API call
    try {
      devLog('✅ Label created (backend integration required)');
      return {
        trackingNumber: `YM${Date.now().toString().slice(-10)}`,
        carrier: 'Yamato',
        status: 'label_created',
        estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
      };
    } catch (error) {
      devError('❌ Error creating Yamato label:', error);
      throw error;
    }
  },

  /**
   * Create shipping label with Sagawa
   */
  createSagawaLabel: async (data: ShippingLabelData): Promise<TrackingInfo> => {
    devLog('📦 Sagawa API - Creating shipping label');
    devLog('Order:', data.orderNumber);
    
    // Mock API call
    try {
      devLog('✅ Label created (backend integration required)');
      return {
        trackingNumber: `SG${Date.now().toString().slice(-10)}`,
        carrier: 'Sagawa',
        status: 'label_created',
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      };
    } catch (error) {
      devError('❌ Error creating Sagawa label:', error);
      throw error;
    }
  },

  /**
   * Get tracking information
   */
  getTracking: async (trackingNumber: string, carrier: string): Promise<TrackingDetails> => {
    devLog(`🔍 Tracking - ${carrier}: ${trackingNumber}`);
    
    // Mock API call
    try {
      devLog('✅ Tracking info retrieved (backend integration required)');
      return {
        trackingNumber,
        carrier,
        status: 'in_transit',
        events: [
          { date: new Date().toISOString(), status: 'label_created', location: 'Hiroshima-ken' },
          { date: new Date().toISOString(), status: 'picked_up', location: 'Hiroshima-ken' }
        ]
      };
    } catch (error) {
      devError('❌ Error getting tracking info:', error);
      throw error;
    }
  },

  /**
   * Determine which carrier API to use based on carrier name
   */
  createLabel: async (carrierName: string, data: ShippingLabelData): Promise<TrackingInfo> => {
    if (carrierName.includes('Japan Post') || carrierName.includes('ゆうパック')) {
      return carrierService.createJapanPostLabel(data);
    } else if (carrierName.includes('Yamato') || carrierName.includes('クロネコ')) {
      return carrierService.createYamatoLabel(data);
    } else if (carrierName.includes('Sagawa') || carrierName.includes('佐川')) {
      return carrierService.createSagawaLabel(data);
    } else {
      throw new Error(`Unknown carrier: ${carrierName}`);
    }
  },

  /**
   * Generate label data for QR code
   */
  generateLabelQRData: (data: ShippingLabelData, trackingNumber: string): string => {
    return JSON.stringify({
      trackingNumber,
      orderNumber: data.orderNumber,
      recipient: {
        name: data.recipient.name,
        postal: data.recipient.postalCode,
        address: `${data.recipient.prefecture} ${data.recipient.city} ${data.recipient.address}`,
        phone: data.recipient.phone
      },
      sender: {
        name: data.sender.name,
        postal: data.sender.postalCode,
        address: data.sender.address,
        phone: data.sender.phone
      },
      deliveryTime: data.deliveryTime
    });
  }
};
