# O que está desativado temporariamente

Guia de tudo que foi **desligado a pedido** nesta reforma do site — nenhum
desses itens teve código apagado, só parou de aparecer/rodar. Cada seção diz
exatamente **onde mexer** para religar.

> Convenção usada no projeto: a maioria das desativações é uma constante
> `export const NOME_ENABLED = false;` em algum arquivo de config. Para
> reativar, troque `false` por `true` no arquivo indicado e salve — não
> precisa mexer em mais nada, a UI/lógica que depende da flag já está pronta.

---

## 0. Problema pré-existente — NÃO é uma desativação desta sessão

Achado ao testar a página do cliente (`/perfil`): ela quebra em local com
`FirebaseError: Expected first argument to collection() to be a
CollectionReference...`. **Confirmado que já acontecia antes de qualquer
mudança desta sessão** (testado revertendo tudo — o erro persiste igual).

Causa: em [`src/config/firebase.ts`](src/config/firebase.ts) (linhas ~17-24),
as credenciais do Firebase estão **hardcoded no código-fonte** com valores
placeholder que nunca foram preenchidos:

```js
apiKey: "PENDING_NIKKEY33F93_API_KEY",
messagingSenderId: "PENDING_NIKKEY33F93_MSG_SENDER_ID",
appId: "PENDING_NIKKEY33F93_APP_ID",
measurementId: "PENDING_NIKKEY33F93_MEASUREMENT_ID",
```

Com isso, `firebaseConfigReady` fica `false` e `db`/`auth` nunca inicializam
em ambiente local — mas algumas telas (ex.: `/perfil`, que busca pedidos e
avaliações no Firestore) tentam usar `db` mesmo assim e travam com erro não
tratado, em vez de cair no modo "local-only" graciosamente.

O banner vermelho que aparece ("verifique as variáveis VITE_FIREBASE_* no
Vercel") é **enganoso**: o código nem lê variáveis de ambiente aqui — os
valores estão fixos neste arquivo, não vêm de `.env`/`.env.local`/Vercel.

**Para corrigir**: preencher os 4 campos `PENDING_NIKKEY33F93_*` em
`src/config/firebase.ts` com os valores reais do Firebase Console (Project
Settings → Your apps → Web app → SDK setup and configuration, projeto
`nikkey-33f93`). Combinado com o usuário: por enquanto fica só documentado
aqui, sem mexer — pediu para não tratar agora.

---

## 1. Flags gerais do site — `src/config/featureFlags.ts`

Arquivo único com a maioria dos interruptores do site (cliente). Abra
[`src/config/featureFlags.ts`](src/config/featureFlags.ts) e troque `false`
por `true` na flag correspondente:

| Flag | O que liga de volta | Onde é usada |
|---|---|---|
| `PWA_INSTALL_ENABLED` | Prompt de instalar o app (banner "Instalar") e a seção "Leve o Japão no seu bolso" da home. Também volta a registrar o Service Worker do PWA. | `src/components/InstallPrompt.tsx`, `src/components/AppDownloadSection.tsx` (renderizado em `src/pages/Index.tsx`), `src/main.tsx` (registro do Service Worker) |
| `KIMICLAW_ENABLED` | Assistente de chat flutuante (bolinha no canto da tela) | `src/components/layout/Layout.tsx` |
| `LANGUAGE_SWITCH_ENABLED` | Seletor de idioma (PT/EN/JA). Hoje a loja fica travada em português mesmo se o storage tiver outro idioma salvo. | `src/context/LanguageContext.tsx` (trava o idioma), componente `src/components/LanguageSwitcher.tsx` (não é renderizado em lugar nenhum hoje — precisa voltar a importar/renderizar em `src/components/layout/Sidebar.tsx`, `src/pages/Login.tsx`, `src/pages/Register.tsx` e `src/pages/Maintenance.tsx` se quiser o seletor de volta) |
| `COUPONS_ENABLED` | Campo de aplicar cupom no Carrinho, Checkout, Revisão do Pedido, e o card "Meus Cupons" na página do cliente | `src/pages/Cart.tsx`, `src/pages/Checkout.tsx` (componente `CouponSelector`), `src/pages/OrderReview.tsx`, `src/pages/Profile.tsx` |
| `ORDER_CONFIRMATION_EMAIL_ENABLED` | E-mail automático de confirmação, disparado ao fechar um pedido (pagamento que não é cartão) | `src/pages/OrderReview.tsx` (linha que chama `emailServiceSimple.sendOrderConfirmation`) |
| `GOOGLE_LOGIN_ENABLED` | Botão "Entrar com Google" (e o divisor "ou" acima dele) nas telas de Login e Cadastro | `src/components/SocialLoginButtons.tsx`, `src/pages/Login.tsx`, `src/pages/Register.tsx` |
| `LOYALTY_POINTS_ENABLED` | **Não fica só em `featureFlags.ts`** — veja a seção 2 abaixo, é mais delicado | — |
| `SIGNUP_POPUPS_ENABLED` | Banner "Cadastre-se e ganhe 10% OFF" (BEMVINDO10) na home/carrinho + o popup de saída que oferece cadastro por e-mail para visitante não logado | `src/components/WelcomeCouponBanner.tsx`, `src/components/ExitIntentPopup.tsx` (variante `guide`) |
| `ADMIN_HEADER_ACTIONS_ENABLED` | Botões "Disparar Notificação Promocional" e "Vlog ATIVO/OCULTO" no topo do painel admin | `src/pages/Admin.tsx` (logo abaixo do título "Painel Administrativo") |

---

## 2. Pontos de fidelidade — `shared/featureFlags.js`

Esta flag **não** mora em `src/config/featureFlags.ts` porque também é lida
pelo servidor (API), não só pelo site. Para religar:

1. Abra [`shared/featureFlags.js`](shared/featureFlags.js) e troque
   `LOYALTY_POINTS_ENABLED` para `true`.

Isso sozinho já:
- Volta a mostrar o card de pontos/tiers na página do cliente
  (`src/pages/Profile.tsx`).
- Volta a creditar pontos de verdade no fechamento do pedido, tanto na tela
  (`src/pages/OrderReview.tsx`) quanto no servidor
  (`api/_lib/commerce.js`, campo `earnedPoints`).

A fórmula em si (1 ponto a cada ¥100 gastos) nunca foi tocada — está intacta
em `shared/points.js`, só não estava sendo chamada enquanto a flag era
`false`. Os testes de `api/_lib/points.test.js` cobrem a fórmula separada da
integração, então continuam passando nos dois estados.

---

## 3. Oferta de isenção da taxa PS no popup de saída

Constante separada, direto no arquivo (não é uma flag global porque só afeta
uma variante de um componente):

- Arquivo: [`src/components/ExitIntentPopup.tsx`](src/components/ExitIntentPopup.tsx)
- Constante: `PS_OFFER_POPUP_ENABLED = false` (perto do topo do arquivo)
- O que liga de volta: a oferta "Finalize agora e a Taxa de Personal Shopper
  sai de graça" que aparecia ao tentar sair do checkout. Enquanto desativada,
  o popup de saída no checkout sempre cai no lembrete genérico (`retention`).

---

## 4. Itens do menu lateral do painel Admin

Não é uma flag booleana — é uma lista de ids escondidos do menu. Para trazer
qualquer um de volta:

- Arquivo: [`src/pages/Admin.tsx`](src/pages/Admin.tsx)
- Procure a constante `DISABLED_TAB_IDS` (um `Set` logo antes de `tabGroupsRaw`).
- Remova o id correspondente do `Set` (ou apague a linha inteira para trazer
  todos de volta de uma vez).

Ids escondidos hoje e a que tela cada um corresponde:

| id | Nome no menu | Grupo |
|---|---|---|
| `affiliates` | Afiliados | Vendas |
| `visitors` | Visitantes | Vendas |
| `coupons` | Cupons | Catálogo |
| `review-moderation` | Moderação Reviews | Catálogo |
| `videos` | Vídeos de review | Solicitações |
| `home` | Início (conteúdo da home) | Conteúdo |
| `vlog` | Vlog | Conteúdo |
| `sorteio` | Sorteio | Conteúdo |
| `marketing` | Gastos Marketing | Financeiro |
| `coupon-usage` | Gastos c/ Cupons | Financeiro |
| `calculator` | Calculadora | Ferramentas |
| `migration` | Migrar Imagens | Ferramentas |
| `thermal-printer` | Impressora Térmica | Ferramentas |
| `whatsapp` | WhatsApp | Ferramentas |

O código/rota de cada tela continua no projeto (nenhuma delas foi apagada) —
só sai da lista de navegação. Se `activeTab` apontar para um desses ids por
algum outro caminho, a tela ainda renderiza normalmente.

---

## 5. Taxa do Personal Shopper — deixou de ser fixa

Isto **não é uma desativação**, é uma mudança de "fixo no código" para
"editável pelo admin" (pedido do usuário). Documentando aqui porque é o
mesmo tipo de ajuste temporário/reversível:

- Antes: `¥1000` estava hardcoded em `src/pages/Checkout.tsx`.
- Agora: valor default continua ¥1.000, mas é lido de
  [`src/services/psFeeSettingsService.ts`](src/services/psFeeSettingsService.ts)
  (Firestore, coleção `settings/psFee`), com editor em
  [`src/components/admin/PsFeeSettings.tsx`](src/components/admin/PsFeeSettings.tsx),
  montado em `src/components/admin/Dashboard.tsx` dentro de
  **Admin → ⚙️ Configurações**.
- Não precisa reverter nada — é a versão definitiva pedida. Só documentando
  onde mexer se precisar mudar o valor padrão no código
  (`DEFAULT_PS_FEE_UNIT_YEN` em `psFeeSettingsService.ts`).

---

## 6. Login de admin — bypass de desenvolvimento

- Arquivo: [`src/context/UserContext.tsx`](src/context/UserContext.tsx),
  bloco no início da função `login()`.
- Usuário `Administrador` + senha `123456` entra no painel **só quando
  rodando `npm run dev` localmente** (`import.meta.env.DEV`). O Vite remove
  esse bloco inteiro do build de produção — nunca vai para o site publicado.
- Sem sessão real do Firebase, então dados protegidos por regra (pedidos,
  clientes) ficam zerados/bloqueados até logar com a conta Firebase de
  verdade.
- **Ação pendente combinada com o usuário**: trocar para login real do
  Firebase quando o site sair do modo de desenvolvimento. Não é uma flag —
  é para apagar o bloco inteiro (tem um comentário grande marcando onde) na
  hora de ir para produção.

---

## 7. Dados de contato em "teste"

Não são features desativadas, mas dados reais trocados por placeholder a
pedido — voltar antes de publicar:

- Arquivo principal: [`shared/company-profile.json`](shared/company-profile.json)
  — e-mail, WhatsApp e endereço de todo o site vêm daqui (Footer, About,
  e-mails transacionais, schema.org). Trocar os valores aqui já atualiza
  tudo.
- Redes sociais (Instagram/Facebook/TikTok/X) apontando para `@teste`:
  - [`src/components/layout/Footer.tsx`](src/components/layout/Footer.tsx) (topo do arquivo, constantes `INSTAGRAM_URL`/`FACEBOOK_URL`/`TIKTOK_URL`/`X_URL`)
  - [`src/components/OrganizationJsonLd.tsx`](src/components/OrganizationJsonLd.tsx) (array `sameAs`)
  - [`src/services/socialFollowService.ts`](src/services/socialFollowService.ts) (`SOCIAL_CONFIG`)
- `config/admin.ts` (e-mail de login do admin no Firebase) **não foi tocado**
  — continua o real, porque é funcional (login de verdade), não um dado de
  exibição.

---

## 8. Barra lateral (Sidebar) — sem seletor de país

O `CountrySwitcher` (bandeira do Brasil) foi **removido do JSX** da Sidebar
(não é uma flag) porque não fazia mais sentido ali. O componente
`src/components/CountrySwitcher.tsx` continua existindo — para trazer de
volta, importe e renderize de novo em
[`src/components/layout/Sidebar.tsx`](src/components/layout/Sidebar.tsx),
na função `content()`, onde antes ficava (perto do link de admin).

---

## Resumo rápido — arquivos para abrir

| Preciso reativar... | Abra este arquivo |
|---|---|
| Idioma, PWA, KimiClaw, cupons, e-mail de confirmação, Google login, popups de cadastro, botões do topo do admin | `src/config/featureFlags.ts` |
| Pontos de fidelidade | `shared/featureFlags.js` |
| Oferta de isenção da taxa PS (popup de saída) | `src/components/ExitIntentPopup.tsx` (`PS_OFFER_POPUP_ENABLED`) |
| Itens do menu do admin (afiliados, cupons, vlog, etc.) | `src/pages/Admin.tsx` (`DISABLED_TAB_IDS`) |
| Login de admin de desenvolvimento → trocar para real | `src/context/UserContext.tsx` |
| Dados de contato (e-mail, endereço, redes sociais) | `shared/company-profile.json` + `Footer.tsx` + `OrganizationJsonLd.tsx` + `socialFollowService.ts` |
| Seletor de país na sidebar | `src/components/layout/Sidebar.tsx` |
