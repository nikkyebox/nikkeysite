import React, { useState, useEffect } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePostalCodeLookup } from '@/hooks/usePostalCodeLookup';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

interface AddressFormProps {
  onAddressChange?: (address: {
    postalCode: string;
    province: string;
    city: string;
    town: string;
    street?: string;
    building?: string;
  }) => void;
}

const AddressForm: React.FC<AddressFormProps> = ({ onAddressChange }) => {
  const { t } = useLanguage();
  const [postalCode, setPostalCode] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [town, setTown] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');

  const { lookupAddress, loading, error } = usePostalCodeLookup();

  // Formata o código postal automaticamente (XXX-XXXX)
  const formatPostalCode = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) {
      return numbers;
    }
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}`;
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPostalCode(e.target.value);
    setPostalCode(formatted);
  };

  const handleSearch = async () => {
    const result = await lookupAddress(postalCode);
    if (result) {
      setProvince(result.province);
      setCity(result.city);
      setTown(result.town);
    }
  };

  // Busca automaticamente quando o código postal estiver completo
  useEffect(() => {
    const cleanCode = postalCode.replace(/\D/g, '');
    if (cleanCode.length === 7) {
      handleSearch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- busca só quando o CEP muda; incluir handleSearch faria buscas a cada render
  }, [postalCode]);

  // Notifica mudanças no endereço completo
  useEffect(() => {
    if (onAddressChange && postalCode && province && city) {
      onAddressChange({
        postalCode,
        province,
        city,
        town,
        street,
        building,
      });
    }
  }, [postalCode, province, city, town, street, building, onAddressChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-5 h-5 text-primary" />
        <h3 className="font-medium text-foreground">{t('address.title')}</h3>
      </div>

      {/* Código Postal */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('address.postalCode')} *
        </label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={postalCode}
            onChange={handlePostalCodeChange}
            placeholder={t('address.exPostal')}
            maxLength={8}
            className={cn(
              "flex-1",
              error && "border-destructive"
            )}
          />
          <Button
            type="button"
            onClick={handleSearch}
            disabled={loading || postalCode.replace(/\D/g, '').length !== 7}
            variant="outline"
            size="icon"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>
        {error && (
          <p className="text-sm text-destructive mt-1">{error}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {t('address.postalHint')}
        </p>
      </div>

      {/* Província */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('address.province')} *
        </label>
        <Input
          type="text"
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          placeholder={t('address.exProvince')}
          readOnly
          className="bg-secondary/50"
        />
      </div>

      {/* Cidade */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('address.city')} *
        </label>
        <Input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder={t('address.exCity')}
          readOnly
          className="bg-secondary/50"
        />
      </div>

      {/* Bairro */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('address.town')} *
        </label>
        <Input
          type="text"
          value={town}
          onChange={(e) => setTown(e.target.value)}
          placeholder={t('address.exTown')}
          readOnly
          className="bg-secondary/50"
        />
      </div>

      {/* Rua e número */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('address.street')} *
        </label>
        <Input
          type="text"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder={t('address.exStreet')}
        />
      </div>

      {/* Nome do prédio/apartamento (opcional) */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('address.building')}
        </label>
        <Input
          type="text"
          value={building}
          onChange={(e) => setBuilding(e.target.value)}
          placeholder={t('address.exBuilding')}
        />
        <p className="text-xs text-muted-foreground mt-1">{t('address.optional')}</p>
      </div>

      {/* Resumo do endereço */}
      {province && city && (
        <div className="bg-secondary/30 rounded-lg p-4 mt-4">
          <p className="text-sm font-medium text-foreground mb-1">{t('address.fullAddress')}</p>
          <p className="text-sm text-muted-foreground">
            〒{postalCode}<br />
            {province} {city} {town} {street} {building}
          </p>
        </div>
      )}
    </div>
  );
};

export default AddressForm;
