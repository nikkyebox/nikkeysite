// Configuração centralizada do administrador.
// A autenticação usa Firebase Auth puro — a senha nunca é armazenada no bundle.
//
// O e-mail do admin PRECISA estar no bundle do cliente: sem ele o atalho de
// super-admin em adminService.authenticate() não casa, o login cai no fluxo de
// cliente comum e o admin "entra como usuário normal". O fallback garante isso
// mesmo em builds onde VITE_ADMIN_EMAIL não foi injetada (Vite só inlineia
// VITE_* em build time, e .env é gitignored — logo ausente na build da Vercel).
// Saber este e-mail não abre o painel: a barreira real é a senha do Firebase
// Auth + email_verified + requireAdmin() no servidor (que ainda exige ADMIN_EMAIL
// no ambiente). Mantenha este valor sincronizado com ADMIN_EMAIL da Vercel.
export const ADMIN_EMAIL =
  (String(import.meta.env.VITE_ADMIN_EMAIL || '').trim() || 'dracko2007@gmail.com').toLowerCase();

export const ADMIN_USER_ID = 'admin-001';

/** Verdadeiro se o e-mail informado é o do administrador. */
export const isAdminEmail = (email?: string | null): boolean =>
  !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
