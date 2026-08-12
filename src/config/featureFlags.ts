// Flags temporárias para desligar features sem remover código — pedido
// explícito para desativar "por enquanto" e reavaliar depois.
export const PWA_INSTALL_ENABLED = false; // InstallPrompt (App.tsx) + AppDownloadSection (Index.tsx)
export const KIMICLAW_ENABLED = false; // ver src/components/layout/Layout.tsx
export const LANGUAGE_SWITCH_ENABLED = false; // ver src/context/LanguageContext.tsx

// Cupons: input/aplicar cupom escondido no Cart/Checkout/OrderReview. Cálculo
// de desconto (computeCouponDiscount, couponService) fica intacto no código.
export const COUPONS_ENABLED = false;

// E-mail automático de confirmação de pedido (OrderReview.tsx, ao finalizar
// pedido que não é cartão). Envio manual pelo admin (Admin.tsx) não é afetado.
export const ORDER_CONFIRMATION_EMAIL_ENABLED = false;

// Botão "Entrar com Google" em Login/Cadastro (SocialLoginButtons.tsx).
export const GOOGLE_LOGIN_ENABLED = false;

// Pontos de fidelidade: card na página do cliente (Profile.tsx) e o ganho de
// pontos por compra (¥100 = 1 pt). Flag real mora em shared/featureFlags.js
// porque também é lida pelo servidor (api/_lib/commerce.js) — mesmo pote que
// credita os pontos de verdade no pedido, não só a exibição. Saldo/tier de
// quem já tinha pontos continua guardado, só para de aparecer/de somar.
export { LOYALTY_POINTS_ENABLED } from '../../shared/featureFlags.js';

// Popups de cadastro: banner "BEMVINDO10" (WelcomeCouponBanner) e o CTA de
// cadastro no popup de saída (ExitIntentPopup).
export const SIGNUP_POPUPS_ENABLED = false;
