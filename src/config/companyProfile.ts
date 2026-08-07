import { COMPANY_PROFILE as SHARED_COMPANY_PROFILE } from '../../shared/company-profile.js';

interface CompanyProfile {
  brand: string;
  legalName: string;
  contactName: string;
  email: string;
  website: string;
  whatsapp: {
    international: string;
    domestic: string;
    digits: string;
  };
  fulfillmentOrigin: {
    postalCode: string;
    addressLine1: string;
    city: string;
    prefecture: string;
    country: string;
    countryPt: string;
    formatted: string;
    formattedJa: string;
    short: string;
    shortPt: string;
  };
}

export const COMPANY_PROFILE = SHARED_COMPANY_PROFILE as CompanyProfile;
