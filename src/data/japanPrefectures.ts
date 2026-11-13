import { Prefecture } from '@/types';

// Zonas de frete doméstico por distância em linha reta a partir de Tsu-shi
// (Mie-ken), origem de envio do NikkeyBox. Cortes (km até a capital):
//   Zona 1: < 150 km  (Mie e vizinhas do Kansai/Chubu)
//   Zona 2: 150–299   (Hokuriku, Tokai leste, Chugoku/Shikoku próximos)
//   Zona 3: 300–479   (Kanto, Chugoku oeste, Kyushu norte e leste de Tohoku)
//   Zona 4: >= 480    (Tohoku, Kyushu, Hokkaido e Okinawa)
// Espelho do servidor: DOMESTIC_ZONE em api/_lib/commerce.js (mesma atribuição).

export const japanPrefectures: Prefecture[] = [
  // Zona 1 (< 150 km)
  { name: 'Mie', nameJa: '三重県', zone: 1 },
  { name: 'Aichi', nameJa: '愛知県', zone: 1 },
  { name: 'Gifu', nameJa: '岐阜県', zone: 1 },
  { name: 'Shiga', nameJa: '滋賀県', zone: 1 },
  { name: 'Kyoto', nameJa: '京都府', zone: 1 },
  { name: 'Nara', nameJa: '奈良県', zone: 1 },
  { name: 'Osaka', nameJa: '大阪府', zone: 1 },
  { name: 'Hyogo', nameJa: '兵庫県', zone: 1 },
  { name: 'Wakayama', nameJa: '和歌山県', zone: 1 },

  // Zona 2 (150–299 km)
  { name: 'Fukui', nameJa: '福井県', zone: 2 },
  { name: 'Shizuoka', nameJa: '静岡県', zone: 2 },
  { name: 'Ishikawa', nameJa: '石川県', zone: 2 },
  { name: 'Toyama', nameJa: '富山県', zone: 2 },
  { name: 'Yamanashi', nameJa: '山梨県', zone: 2 },
  { name: 'Nagano', nameJa: '長野県', zone: 2 },
  { name: 'Tottori', nameJa: '鳥取県', zone: 2 },
  { name: 'Okayama', nameJa: '岡山県', zone: 2 },
  { name: 'Kagawa', nameJa: '香川県', zone: 2 },
  { name: 'Tokushima', nameJa: '徳島県', zone: 2 },

  // Zona 3 (300–479 km)
  { name: 'Tokyo', nameJa: '東京都', zone: 3 },
  { name: 'Kanagawa', nameJa: '神奈川県', zone: 3 },
  { name: 'Saitama', nameJa: '埼玉県', zone: 3 },
  { name: 'Chiba', nameJa: '千葉県', zone: 3 },
  { name: 'Gunma', nameJa: '群馬県', zone: 3 },
  { name: 'Tochigi', nameJa: '栃木県', zone: 3 },
  { name: 'Ibaraki', nameJa: '茨城県', zone: 3 },
  { name: 'Niigata', nameJa: '新潟県', zone: 3 },
  { name: 'Hiroshima', nameJa: '広島県', zone: 3 },
  { name: 'Shimane', nameJa: '島根県', zone: 3 },
  { name: 'Yamaguchi', nameJa: '山口県', zone: 3 },
  { name: 'Ehime', nameJa: '愛媛県', zone: 3 },
  { name: 'Kochi', nameJa: '高知県', zone: 3 },

  // Zona 4 (>= 480 km)
  { name: 'Fukuoka', nameJa: '福岡県', zone: 4 },
  { name: 'Saga', nameJa: '佐賀県', zone: 4 },
  { name: 'Nagasaki', nameJa: '長崎県', zone: 4 },
  { name: 'Kumamoto', nameJa: '熊本県', zone: 4 },
  { name: 'Oita', nameJa: '大分県', zone: 4 },
  { name: 'Miyazaki', nameJa: '宮崎県', zone: 4 },
  { name: 'Kagoshima', nameJa: '鹿児島県', zone: 4 },
  { name: 'Fukushima', nameJa: '福島県', zone: 4 },
  { name: 'Yamagata', nameJa: '山形県', zone: 4 },
  { name: 'Miyagi', nameJa: '宮城県', zone: 4 },
  { name: 'Akita', nameJa: '秋田県', zone: 4 },
  { name: 'Iwate', nameJa: '岩手県', zone: 4 },
  { name: 'Aomori', nameJa: '青森県', zone: 4 },
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
