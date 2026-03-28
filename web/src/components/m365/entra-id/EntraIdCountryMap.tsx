import { AttackMap } from '@/components/firewall/AttackMap';
import { getCountryCode } from '@/lib/countryUtils';

interface EntraIdCountryMapProps {
  loginCountriesSuccess: { country: string; count: number }[];
  fullscreen?: boolean;
}

export function EntraIdCountryMap({ loginCountriesSuccess, fullscreen = false }: EntraIdCountryMapProps) {
  const normalizedCountries = loginCountriesSuccess.map((countryItem) => {
    const rawCountry = countryItem.country?.trim().toLowerCase();
    const normalizedCountry = rawCountry && rawCountry.length === 2
      ? rawCountry
      : getCountryCode(countryItem.country) || countryItem.country;

    return {
      country: normalizedCountry,
      count: countryItem.count,
    };
  });

  return (
    <AttackMap
      authFailedCountries={[]}
      authSuccessCountries={normalizedCountries}
      fullscreen={fullscreen}
      hideLegend
      labelMap={{
        authSuccess: 'Login com Sucesso',
      }}
    />
  );
}
