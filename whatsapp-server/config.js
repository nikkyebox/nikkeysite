/**
 * Configuração do servidor de WhatsApp.
 */
module.exports = {
  // Porta HTTP em que este servidor vai escutar
  serverPort: 3220,

  // Origens permitidas (domínio do site + localhost para testes)
  allowedOrigins: [
    'https://www.nikkeybox-store.com',
    'http://localhost:5173',
    'http://localhost:4173',
  ],

  // Token secreto para autenticar as requisições do site.
  // Troque por uma string longa e aleatória — configure o MESMO valor
  // em Configurações > WhatsApp no painel admin do site.
  authToken: 'nikkey-box-whatsapp-token-2024',

  // Código do país padrão para números sem DDI (Brasil = 55).
  // Se o cliente digitou só o DDD + número, prefixamos com isto.
  defaultCountryCode: '55',
};
