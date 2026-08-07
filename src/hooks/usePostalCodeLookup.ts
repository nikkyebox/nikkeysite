import { useState } from 'react';

// Interface para dados de endereço japonês
export interface JapaneseAddress {
  postalCode: string;
  province: string; // Província (都道府県)
  city: string; // Cidade (市区町村)
  town: string; // Bairro/Área (町域)
}

// Serviço para buscar endereço pelo código postal japonês
export const usePostalCodeLookup = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupAddress = async (postalCode: string): Promise<JapaneseAddress | null> => {
    setLoading(true);
    setError(null);

    try {
      // Remove hífens e espaços do código postal
      const cleanCode = postalCode.replace(/[-\s]/g, '');

      // Valida formato do código postal japonês (7 dígitos)
      if (!/^\d{7}$/.test(cleanCode)) {
        throw new Error('Código postal deve ter 7 dígitos (ex: 100-0001 ou 1000001)');
      }

      // API gratuita de código postal do Japão: https://zipcloud.ibsnet.co.jp/
      const response = await fetch(
        `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanCode}`
      );

      if (!response.ok) {
        throw new Error('Erro ao buscar endereço');
      }

      const data = await response.json();

      if (data.status !== 200) {
        throw new Error(data.message || 'Erro ao buscar endereço');
      }

      if (!data.results || data.results.length === 0) {
        throw new Error('Código postal não encontrado');
      }

      // Pega o primeiro resultado
      const result = data.results[0];

      return {
        postalCode: `${cleanCode.slice(0, 3)}-${cleanCode.slice(3)}`,
        province: result.address1, // Província (ex: 東京都)
        city: result.address2, // Cidade (ex: 千代田区)
        town: result.address3, // Bairro (ex: 千代田)
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar endereço';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { lookupAddress, loading, error };
};
