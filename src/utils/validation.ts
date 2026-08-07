// Utilitários de validação e máscara de inputs.
// Cobrem os campos usados na loja: e-mail, telefone, CPF (alfândega Brasil),
// CEP japonês (〒XXX-XXXX) e nome.

/* ------------------------------------------------------------------ */
/*  Validações                                                         */
/* ------------------------------------------------------------------ */

export const isValidEmail = (email: string): boolean => {
  const value = email.trim();
  // RFC simplificado: algo@dominio.tld
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
};

/** Valida CPF brasileiro com os dois dígitos verificadores. */
export const isValidCPF = (cpf: string): boolean => {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  // Rejeita sequências repetidas (000..., 111..., etc.)
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheck = (slice: string, factorStart: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += parseInt(slice[i], 10) * (factorStart - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const check1 = calcCheck(digits.slice(0, 9), 10);
  if (check1 !== parseInt(digits[9], 10)) return false;
  const check2 = calcCheck(digits.slice(0, 10), 11);
  if (check2 !== parseInt(digits[10], 10)) return false;
  return true;
};

/** Valida CNPJ brasileiro (14 dígitos) com os dois dígitos verificadores. */
export const isValidCNPJ = (cnpj: string): boolean => {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const calc = (len: number): number => {
    const weights = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(d[i], 10) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  if (calc(12) !== parseInt(d[12], 10)) return false;
  if (calc(13) !== parseInt(d[13], 10)) return false;
  return true;
};

/** Formata CNPJ: 00.000.000/0000-00 */
export const maskCNPJ = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

/** CEP japonês: 7 dígitos (com ou sem hífen). */
export const isValidJapanesePostalCode = (cep: string): boolean => {
  const digits = cep.replace(/\D/g, '');
  return digits.length === 7;
};

/** Telefone internacional (E.164): 8 a 15 dígitos, com ou sem código do país. */
export const isValidPhone = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
};

/** Lista completa de países com DDI para o cadastro (ordenada A→Z). */
export const COUNTRY_DIAL_CODES = [
  // Destaques no topo
  { country: 'Brasil', code: '+55', flag: '🇧🇷' },
  { country: 'Japão', code: '+81', flag: '🇯🇵' },
  { country: 'EUA / Canadá', code: '+1', flag: '🇺🇸' },
  { country: 'Portugal', code: '+351', flag: '🇵🇹' },
  // Resto A→Z
  { country: 'Afeganistão', code: '+93', flag: '🇦🇫' },
  { country: 'África do Sul', code: '+27', flag: '🇿🇦' },
  { country: 'Albânia', code: '+355', flag: '🇦🇱' },
  { country: 'Alemanha', code: '+49', flag: '🇩🇪' },
  { country: 'Andorra', code: '+376', flag: '🇦🇩' },
  { country: 'Angola', code: '+244', flag: '🇦🇴' },
  { country: 'Antígua e Barbuda', code: '+1-268', flag: '🇦🇬' },
  { country: 'Arábia Saudita', code: '+966', flag: '🇸🇦' },
  { country: 'Argélia', code: '+213', flag: '🇩🇿' },
  { country: 'Argentina', code: '+54', flag: '🇦🇷' },
  { country: 'Armênia', code: '+374', flag: '🇦🇲' },
  { country: 'Austrália', code: '+61', flag: '🇦🇺' },
  { country: 'Áustria', code: '+43', flag: '🇦🇹' },
  { country: 'Azerbaijão', code: '+994', flag: '🇦🇿' },
  { country: 'Bahamas', code: '+1-242', flag: '🇧🇸' },
  { country: 'Bangladesh', code: '+880', flag: '🇧🇩' },
  { country: 'Barbados', code: '+1-246', flag: '🇧🇧' },
  { country: 'Barein', code: '+973', flag: '🇧🇭' },
  { country: 'Bélgica', code: '+32', flag: '🇧🇪' },
  { country: 'Belize', code: '+501', flag: '🇧🇿' },
  { country: 'Benim', code: '+229', flag: '🇧🇯' },
  { country: 'Bielorrússia', code: '+375', flag: '🇧🇾' },
  { country: 'Bolívia', code: '+591', flag: '🇧🇴' },
  { country: 'Bósnia e Herzegovina', code: '+387', flag: '🇧🇦' },
  { country: 'Botsuana', code: '+267', flag: '🇧🇼' },
  { country: 'Brunei', code: '+673', flag: '🇧🇳' },
  { country: 'Bulgária', code: '+359', flag: '🇧🇬' },
  { country: 'Burkina Faso', code: '+226', flag: '🇧🇫' },
  { country: 'Burundi', code: '+257', flag: '🇧🇮' },
  { country: 'Butão', code: '+975', flag: '🇧🇹' },
  { country: 'Cabo Verde', code: '+238', flag: '🇨🇻' },
  { country: 'Camarões', code: '+237', flag: '🇨🇲' },
  { country: 'Camboja', code: '+855', flag: '🇰🇭' },
  { country: 'Canadá', code: '+1', flag: '🇨🇦' },
  { country: 'Catar', code: '+974', flag: '🇶🇦' },
  { country: 'Cazaquistão', code: '+7', flag: '🇰🇿' },
  { country: 'Chade', code: '+235', flag: '🇹🇩' },
  { country: 'Chile', code: '+56', flag: '🇨🇱' },
  { country: 'China', code: '+86', flag: '🇨🇳' },
  { country: 'Chipre', code: '+357', flag: '🇨🇾' },
  { country: 'Colômbia', code: '+57', flag: '🇨🇴' },
  { country: 'Comores', code: '+269', flag: '🇰🇲' },
  { country: 'Congo (RDC)', code: '+243', flag: '🇨🇩' },
  { country: 'Congo (Rep.)', code: '+242', flag: '🇨🇬' },
  { country: 'Coreia do Norte', code: '+850', flag: '🇰🇵' },
  { country: 'Coreia do Sul', code: '+82', flag: '🇰🇷' },
  { country: 'Costa do Marfim', code: '+225', flag: '🇨🇮' },
  { country: 'Costa Rica', code: '+506', flag: '🇨🇷' },
  { country: 'Croácia', code: '+385', flag: '🇭🇷' },
  { country: 'Cuba', code: '+53', flag: '🇨🇺' },
  { country: 'Dinamarca', code: '+45', flag: '🇩🇰' },
  { country: 'Djibuti', code: '+253', flag: '🇩🇯' },
  { country: 'Dominica', code: '+1-767', flag: '🇩🇲' },
  { country: 'Egito', code: '+20', flag: '🇪🇬' },
  { country: 'El Salvador', code: '+503', flag: '🇸🇻' },
  { country: 'Emirados Árabes', code: '+971', flag: '🇦🇪' },
  { country: 'Equador', code: '+593', flag: '🇪🇨' },
  { country: 'Eritreia', code: '+291', flag: '🇪🇷' },
  { country: 'Eslováquia', code: '+421', flag: '🇸🇰' },
  { country: 'Eslovênia', code: '+386', flag: '🇸🇮' },
  { country: 'Espanha', code: '+34', flag: '🇪🇸' },
  { country: 'Estônia', code: '+372', flag: '🇪🇪' },
  { country: 'Eswatini', code: '+268', flag: '🇸🇿' },
  { country: 'Etiópia', code: '+251', flag: '🇪🇹' },
  { country: 'Fiji', code: '+679', flag: '🇫🇯' },
  { country: 'Filipinas', code: '+63', flag: '🇵🇭' },
  { country: 'Finlândia', code: '+358', flag: '🇫🇮' },
  { country: 'França', code: '+33', flag: '🇫🇷' },
  { country: 'Gabão', code: '+241', flag: '🇬🇦' },
  { country: 'Gâmbia', code: '+220', flag: '🇬🇲' },
  { country: 'Gana', code: '+233', flag: '🇬🇭' },
  { country: 'Geórgia', code: '+995', flag: '🇬🇪' },
  { country: 'Gibraltar', code: '+350', flag: '🇬🇮' },
  { country: 'Granada', code: '+1-473', flag: '🇬🇩' },
  { country: 'Grécia', code: '+30', flag: '🇬🇷' },
  { country: 'Guatemala', code: '+502', flag: '🇬🇹' },
  { country: 'Guiné', code: '+224', flag: '🇬🇳' },
  { country: 'Guiné Bissau', code: '+245', flag: '🇬🇼' },
  { country: 'Guiné Equatorial', code: '+240', flag: '🇬🇶' },
  { country: 'Guiana', code: '+592', flag: '🇬🇾' },
  { country: 'Haiti', code: '+509', flag: '🇭🇹' },
  { country: 'Honduras', code: '+504', flag: '🇭🇳' },
  { country: 'Hong Kong', code: '+852', flag: '🇭🇰' },
  { country: 'Hungria', code: '+36', flag: '🇭🇺' },
  { country: 'Iêmen', code: '+967', flag: '🇾🇪' },
  { country: 'Índia', code: '+91', flag: '🇮🇳' },
  { country: 'Indonésia', code: '+62', flag: '🇮🇩' },
  { country: 'Iraque', code: '+964', flag: '🇮🇶' },
  { country: 'Irã', code: '+98', flag: '🇮🇷' },
  { country: 'Irlanda', code: '+353', flag: '🇮🇪' },
  { country: 'Islândia', code: '+354', flag: '🇮🇸' },
  { country: 'Israel', code: '+972', flag: '🇮🇱' },
  { country: 'Itália', code: '+39', flag: '🇮🇹' },
  { country: 'Jamaica', code: '+1-876', flag: '🇯🇲' },
  { country: 'Jordânia', code: '+962', flag: '🇯🇴' },
  { country: 'Kosovo', code: '+383', flag: '🇽🇰' },
  { country: 'Kuwait', code: '+965', flag: '🇰🇼' },
  { country: 'Laos', code: '+856', flag: '🇱🇦' },
  { country: 'Lesoto', code: '+266', flag: '🇱🇸' },
  { country: 'Letônia', code: '+371', flag: '🇱🇻' },
  { country: 'Líbano', code: '+961', flag: '🇱🇧' },
  { country: 'Libéria', code: '+231', flag: '🇱🇷' },
  { country: 'Líbia', code: '+218', flag: '🇱🇾' },
  { country: 'Liechtenstein', code: '+423', flag: '🇱🇮' },
  { country: 'Lituânia', code: '+370', flag: '🇱🇹' },
  { country: 'Luxemburgo', code: '+352', flag: '🇱🇺' },
  { country: 'Macau', code: '+853', flag: '🇲🇴' },
  { country: 'Macedônia do Norte', code: '+389', flag: '🇲🇰' },
  { country: 'Madagascar', code: '+261', flag: '🇲🇬' },
  { country: 'Malásia', code: '+60', flag: '🇲🇾' },
  { country: 'Malawi', code: '+265', flag: '🇲🇼' },
  { country: 'Maldivas', code: '+960', flag: '🇲🇻' },
  { country: 'Mali', code: '+223', flag: '🇲🇱' },
  { country: 'Malta', code: '+356', flag: '🇲🇹' },
  { country: 'Marrocos', code: '+212', flag: '🇲🇦' },
  { country: 'Maurício', code: '+230', flag: '🇲🇺' },
  { country: 'Mauritânia', code: '+222', flag: '🇲🇷' },
  { country: 'México', code: '+52', flag: '🇲🇽' },
  { country: 'Mianmar', code: '+95', flag: '🇲🇲' },
  { country: 'Moçambique', code: '+258', flag: '🇲🇿' },
  { country: 'Moldávia', code: '+373', flag: '🇲🇩' },
  { country: 'Mônaco', code: '+377', flag: '🇲🇨' },
  { country: 'Mongólia', code: '+976', flag: '🇲🇳' },
  { country: 'Montenegro', code: '+382', flag: '🇲🇪' },
  { country: 'Namíbia', code: '+264', flag: '🇳🇦' },
  { country: 'Nepal', code: '+977', flag: '🇳🇵' },
  { country: 'Nicarágua', code: '+505', flag: '🇳🇮' },
  { country: 'Níger', code: '+227', flag: '🇳🇪' },
  { country: 'Nigéria', code: '+234', flag: '🇳🇬' },
  { country: 'Noruega', code: '+47', flag: '🇳🇴' },
  { country: 'Nova Zelândia', code: '+64', flag: '🇳🇿' },
  { country: 'Omã', code: '+968', flag: '🇴🇲' },
  { country: 'Países Baixos', code: '+31', flag: '🇳🇱' },
  { country: 'Paquistão', code: '+92', flag: '🇵🇰' },
  { country: 'Panamá', code: '+507', flag: '🇵🇦' },
  { country: 'Papua Nova Guiné', code: '+675', flag: '🇵🇬' },
  { country: 'Paraguai', code: '+595', flag: '🇵🇾' },
  { country: 'Peru', code: '+51', flag: '🇵🇪' },
  { country: 'Polônia', code: '+48', flag: '🇵🇱' },
  { country: 'Porto Rico', code: '+1-787', flag: '🇵🇷' },
  { country: 'Quirguistão', code: '+996', flag: '🇰🇬' },
  { country: 'Quênia', code: '+254', flag: '🇰🇪' },
  { country: 'Reino Unido', code: '+44', flag: '🇬🇧' },
  { country: 'República Centro-Africana', code: '+236', flag: '🇨🇫' },
  { country: 'República Dominicana', code: '+1-809', flag: '🇩🇴' },
  { country: 'República Tcheca', code: '+420', flag: '🇨🇿' },
  { country: 'Romênia', code: '+40', flag: '🇷🇴' },
  { country: 'Ruanda', code: '+250', flag: '🇷🇼' },
  { country: 'Rússia', code: '+7', flag: '🇷🇺' },
  { country: 'Samoa', code: '+685', flag: '🇼🇸' },
  { country: 'San Marino', code: '+378', flag: '🇸🇲' },
  { country: 'Santa Lúcia', code: '+1-758', flag: '🇱🇨' },
  { country: 'São Cristóvão e Névis', code: '+1-869', flag: '🇰🇳' },
  { country: 'São Tomé e Príncipe', code: '+239', flag: '🇸🇹' },
  { country: 'São Vicente e Granadinas', code: '+1-784', flag: '🇻🇨' },
  { country: 'Senegal', code: '+221', flag: '🇸🇳' },
  { country: 'Serra Leoa', code: '+232', flag: '🇸🇱' },
  { country: 'Sérvia', code: '+381', flag: '🇷🇸' },
  { country: 'Seychelles', code: '+248', flag: '🇸🇨' },
  { country: 'Singapura', code: '+65', flag: '🇸🇬' },
  { country: 'Síria', code: '+963', flag: '🇸🇾' },
  { country: 'Somália', code: '+252', flag: '🇸🇴' },
  { country: 'Sri Lanka', code: '+94', flag: '🇱🇰' },
  { country: 'Sudão', code: '+249', flag: '🇸🇩' },
  { country: 'Sudão do Sul', code: '+211', flag: '🇸🇸' },
  { country: 'Suécia', code: '+46', flag: '🇸🇪' },
  { country: 'Suíça', code: '+41', flag: '🇨🇭' },
  { country: 'Suriname', code: '+597', flag: '🇸🇷' },
  { country: 'Tailândia', code: '+66', flag: '🇹🇭' },
  { country: 'Taiwan', code: '+886', flag: '🇹🇼' },
  { country: 'Tajiquistão', code: '+992', flag: '🇹🇯' },
  { country: 'Tanzânia', code: '+255', flag: '🇹🇿' },
  { country: 'Timor-Leste', code: '+670', flag: '🇹🇱' },
  { country: 'Togo', code: '+228', flag: '🇹🇬' },
  { country: 'Trinidad e Tobago', code: '+1-868', flag: '🇹🇹' },
  { country: 'Tunísia', code: '+216', flag: '🇹🇳' },
  { country: 'Turcomenistão', code: '+993', flag: '🇹🇲' },
  { country: 'Turquia', code: '+90', flag: '🇹🇷' },
  { country: 'Tuvalu', code: '+688', flag: '🇹🇻' },
  { country: 'Ucrânia', code: '+380', flag: '🇺🇦' },
  { country: 'Uganda', code: '+256', flag: '🇺🇬' },
  { country: 'Uruguai', code: '+598', flag: '🇺🇾' },
  { country: 'Uzbequistão', code: '+998', flag: '🇺🇿' },
  { country: 'Vanuatu', code: '+678', flag: '🇻🇺' },
  { country: 'Venezuela', code: '+58', flag: '🇻🇪' },
  { country: 'Vietnã', code: '+84', flag: '🇻🇳' },
  { country: 'Zimbábue', code: '+263', flag: '🇿🇼' },
  { country: 'Zâmbia', code: '+260', flag: '🇿🇲' },
];

export const isNonEmpty = (value: string, min = 1): boolean =>
  value.trim().length >= min;

/* ------------------------------------------------------------------ */
/*  Máscaras (formatação durante a digitação)                          */
/* ------------------------------------------------------------------ */

/** Só os 11 dígitos — é a forma usada como ID em `cpf_index`. */
export const normalizeCPF = (cpf: string): string => cpf.replace(/\D/g, '');

/** Formata CPF: 000.000.000-00 */
export const maskCPF = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

/** Formata CEP japonês: 000-0000 */
export const maskJapanesePostalCode = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 7);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
};

/** Formata telefone japonês: 000-0000-0000 (ou 00-0000-0000) */
export const maskPhone = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
};

/* ------------------------------------------------------------------ */
/*  Helper de validação de formulário                                  */
/* ------------------------------------------------------------------ */

export type FieldErrors = Record<string, string>;

/**
 * Recebe um objeto de regras { campo: () => mensagemDeErro | null } e
 * retorna o mapa de erros (vazio = válido).
 */
export const runValidations = (
  rules: Record<string, () => string | null>
): FieldErrors => {
  const errors: FieldErrors = {};
  for (const [field, rule] of Object.entries(rules)) {
    const msg = rule();
    if (msg) errors[field] = msg;
  }
  return errors;
};
