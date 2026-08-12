import { describe, expect, it } from 'vitest';
import { COMPANY_PROFILE } from './companyProfile';

// Dados de contato temporariamente em "teste" (ver shared/company-profile.json)
// a pedido — trocar de volta para os reais antes de publicar. Este teste só
// garante que shared/company-profile.json continua sendo a fonte única lida
// em todo lugar (Footer, About, e-mails, schema.org), não valida o conteúdo
// exato — isso muda conforme o negócio decide o que exibir.
describe('company profile is read from the shared single source of truth', () => {
  it('exposes the fields every contact surface depends on', () => {
    expect(COMPANY_PROFILE.email).toBeTruthy();
    expect(COMPANY_PROFILE.fulfillmentOrigin).toMatchObject({
      postalCode: expect.any(String),
      addressLine1: expect.any(String),
      city: expect.any(String),
      prefecture: expect.any(String),
      country: expect.any(String),
      formatted: expect.any(String),
      formattedJa: expect.any(String),
    });
    expect(COMPANY_PROFILE.whatsapp.digits).toBeTruthy();
  });
});
