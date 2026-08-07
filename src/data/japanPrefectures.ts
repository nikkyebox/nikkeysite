import { Prefecture } from '@/types';

// Zonas por distância a partir de Hiroshima (centro logístico, região Chugoku)
// Zona 1: Hiroshima e vizinhas (Chugoku + Shikoku mais próximo)
// Zona 2: Kansai, Kyushu norte e resto de Shikoku
// Zona 3: Chubu, Kanto e Kyushu sul
// Zona 4: Tohoku, Hokkaido e Okinawa (mais distantes)

export const japanPrefectures: Prefecture[] = [
  // Chugoku Region — origem (Zona 1)
  { name: 'Hiroshima', nameJa: '広島県', zone: 1 },
  { name: 'Okayama', nameJa: '岡山県', zone: 1 },
  { name: 'Yamaguchi', nameJa: '山口県', zone: 1 },
  { name: 'Tottori', nameJa: '鳥取県', zone: 1 },
  { name: 'Shimane', nameJa: '島根県', zone: 1 },

  // Shikoku Region (Zona 1-2)
  { name: 'Ehime', nameJa: '愛媛県', zone: 1 },
  { name: 'Kagawa', nameJa: '香川県', zone: 2 },
  { name: 'Tokushima', nameJa: '徳島県', zone: 2 },
  { name: 'Kochi', nameJa: '高知県', zone: 2 },

  // Kansai Region (Zona 2)
  { name: 'Hyogo', nameJa: '兵庫県', zone: 2 },
  { name: 'Osaka', nameJa: '大阪府', zone: 2 },
  { name: 'Kyoto', nameJa: '京都府', zone: 2 },
  { name: 'Nara', nameJa: '奈良県', zone: 2 },
  { name: 'Shiga', nameJa: '滋賀県', zone: 2 },
  { name: 'Wakayama', nameJa: '和歌山県', zone: 2 },

  // Kyushu Norte (Zona 2)
  { name: 'Fukuoka', nameJa: '福岡県', zone: 2 },
  { name: 'Saga', nameJa: '佐賀県', zone: 2 },
  { name: 'Nagasaki', nameJa: '長崎県', zone: 2 },
  { name: 'Kumamoto', nameJa: '熊本県', zone: 2 },
  { name: 'Oita', nameJa: '大分県', zone: 2 },

  // Kyushu Sul (Zona 3)
  { name: 'Miyazaki', nameJa: '宮崎県', zone: 3 },
  { name: 'Kagoshima', nameJa: '鹿児島県', zone: 3 },

  // Chubu Region (Zona 3)
  { name: 'Mie', nameJa: '三重県', zone: 3 },
  { name: 'Aichi', nameJa: '愛知県', zone: 3 },
  { name: 'Gifu', nameJa: '岐阜県', zone: 3 },
  { name: 'Shizuoka', nameJa: '静岡県', zone: 3 },
  { name: 'Nagano', nameJa: '長野県', zone: 3 },
  { name: 'Fukui', nameJa: '福井県', zone: 3 },
  { name: 'Ishikawa', nameJa: '石川県', zone: 3 },
  { name: 'Toyama', nameJa: '富山県', zone: 3 },
  { name: 'Niigata', nameJa: '新潟県', zone: 3 },
  { name: 'Yamanashi', nameJa: '山梨県', zone: 3 },

  // Kanto Region (Zona 3)
  { name: 'Tokyo', nameJa: '東京都', zone: 3 },
  { name: 'Kanagawa', nameJa: '神奈川県', zone: 3 },
  { name: 'Saitama', nameJa: '埼玉県', zone: 3 },
  { name: 'Chiba', nameJa: '千葉県', zone: 3 },
  { name: 'Ibaraki', nameJa: '茨城県', zone: 3 },
  { name: 'Tochigi', nameJa: '栃木県', zone: 3 },
  { name: 'Gunma', nameJa: '群馬県', zone: 3 },

  // Tohoku Region (Zona 4)
  { name: 'Miyagi', nameJa: '宮城県', zone: 4 },
  { name: 'Fukushima', nameJa: '福島県', zone: 4 },
  { name: 'Yamagata', nameJa: '山形県', zone: 4 },
  { name: 'Iwate', nameJa: '岩手県', zone: 4 },
  { name: 'Akita', nameJa: '秋田県', zone: 4 },
  { name: 'Aomori', nameJa: '青森県', zone: 4 },

  // Distantes (Zona 4)
  { name: 'Hokkaido', nameJa: '北海道', zone: 4 },
  { name: 'Okinawa', nameJa: '沖縄県', zone: 4 },
];

// Shipping rates by carrier, box size, and zone (in JPY)
export const japanShippingRates = {
  yuubin: {
    '60': { 1: 870, 2: 970, 3: 1100, 4: 1350 },
    '80': { 1: 1100, 2: 1200, 3: 1400, 4: 1700 }
  },
  yamato: {
    '60': { 1: 930, 2: 1040, 3: 1150, 4: 1480 },
    '80': { 1: 1150, 2: 1260, 3: 1370, 4: 1810 }
  },
  sagawa: {
    '60': { 1: 880, 2: 990, 3: 1100, 4: 1430 },
    '80': { 1: 1100, 2: 1210, 3: 1430, 4: 1760 }
  }
};

export type JapanCarrierName = keyof typeof japanShippingRates;
export type JapanBoxSize = '60' | '80';
