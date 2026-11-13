import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Artefatos gerados e snapshots/scripts avulsos da raiz, fora do código ativo.
    ignores: [
      "dist",
      "dev-dist",
      "original_*_github.tsx",
      "full_original_*",
      "fix-images.ts",
      "update-local-images.ts",
      "auto-setup-images.ts",
      "replace-urls.js",
      "build-debug.js",
      "fetch-pass2.cjs",
      "fetch-real-images.cjs",
      "gen-placeholders.cjs",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Hooks e variantes de estilo exportados junto dos componentes são a API
      // padrão desses módulos (shadcn/ui e providers); o Fast Refresh só perde o
      // estado de módulo nesses casos. Mover cada um exigiria trocar dezenas de imports.
      "react-refresh/only-export-components": ["warn", {
        allowConstantExport: true,
        allowExportNames: [
          "useUser", "useCart", "useLanguage", "useProducts", "useSidebar", "useFormField",
          "buttonVariants", "badgeVariants", "toggleVariants", "navigationMenuTriggerStyle",
          "toast",
        ],
      }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
