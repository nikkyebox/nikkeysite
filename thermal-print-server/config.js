/**
 * Configuração do servidor de impressão térmica.
 * Edite este arquivo para apontar para a sua impressora.
 */
module.exports = {
  // Porta HTTP em que este servidor vai escutar
  serverPort: 3210,

  // Endereço IP da impressora na rede local
  printerIp: '192.168.11.100',

  // Porta da impressora (padrão para a maioria das térmicas de rede)
  printerPort: 9100,

  // Largura do papel em colunas de caracteres
  // 58mm  → 32 colunas
  // 80mm  → 48 colunas
  paperColumns: 48,

  // Origens permitidas (domínio do seu site + localhost para testes)
  allowedOrigins: [
    'https://www.nikkeybox-store.com',
    'http://localhost:5173',
    'http://localhost:4173',
  ],

  // Token secreto para autenticar as requisições do site
  // Troque por uma string longa e aleatória — configure o mesmo valor
  // em Configurações > Impressora no painel admin do site.
  authToken: 'nikkey-box-print-token-2024',
};
