/**
 * Converte texto japonês para romaji
 * Usa mapeamento manual de cidades e bairros comuns
 */

// Mapeamento básico de kanji comuns para romaji
const basicKanjiMap: Record<string, string> = {
  '市': 'shi',
  '区': 'ku',
  '町': 'cho',
  '村': 'mura',
  '県': 'ken',
  '都': 'to',
  '府': 'fu',
  '郡': 'gun',
};

/**
 * Tenta romanizar texto japonês usando mapeamento manual
 */
export const romanizeJapanese = (text: string): string => {
  if (!text) return '';
  
  // Se já contém parênteses com romaji, retorna como está
  if (text.includes('(') && text.includes(')')) {
    return text;
  }
  
  // Usa o mapeamento manual
  return addAddressHintsSync(text);
};

/**
 * Adiciona dicas de leitura para partes comuns de endereço
 */
export const addAddressHints = (text: string): string => {
  if (!text) return '';
  
  // Usa mapeamento manual
  return addAddressHintsSync(text);
};

/**
 * Versão síncrona com mapeamento manual (fallback)
 */
export const addAddressHintsSync = (text: string): string => {
  if (!text) return '';
  
  // Separate complete city names from generic suffixes
  const cityNames: { [key: string]: string } = {
    // Cities
    '福山市': 'Fukuyama-shi',
    '名古屋市': 'Nagoya-shi',
    '大阪市': 'Osaka-shi',
    '東京都': 'Tokyo-to',
    '京都市': 'Kyoto-shi',
    '神戸市': 'Kobe-shi',
    '横浜市': 'Yokohama-shi',
    '札幌市': 'Sapporo-shi',
    '福岡市': 'Fukuoka-shi',
    '仙台市': 'Sendai-shi',
    // Common districts/neighborhoods
    '千代田区': 'Chiyoda-ku',
    '中央区': 'Chuo-ku',
    '港区': 'Minato-ku',
    '新宿区': 'Shinjuku-ku',
    '渋谷区': 'Shibuya-ku',
  };

  const genericSuffixes: { [key: string]: string } = {
    '市': 'shi',
    '区': 'ku',
    '町': 'cho',
    '村': 'mura',
    '郡': 'gun',
  };

  let result = text;
  let hasCompleteMatch = false;
  
  // First, try complete city/district names (longer strings first)
  const sortedCities = Object.entries(cityNames).sort((a, b) => b[0].length - a[0].length);
  
  for (const [japanese, romaji] of sortedCities) {
    if (result.includes(japanese) && !result.includes(`(${romaji})`)) {
      result = result.replace(japanese, `${japanese} (${romaji})`);
      hasCompleteMatch = true;
    }
  }

  // Only apply generic suffixes if no complete match was found
  if (!hasCompleteMatch) {
    for (const [kanji, romaji] of Object.entries(genericSuffixes)) {
      if (result.includes(kanji) && !result.includes(`(${romaji})`)) {
        result = result.replace(kanji, `${kanji} (${romaji})`);
      }
    }
  }

  return result;
};

/**
 * Formata cidade e bairro com informação adicional
 */
export const formatCityAddress = (city: string, town: string = ''): string => {
  if (!city && !town) return '';
  
  const fullAddress = town ? `${city} ${town}` : city;
  
  // Adiciona hints para termos comuns
  return addAddressHints(fullAddress);
};
