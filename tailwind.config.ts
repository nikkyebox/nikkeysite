import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      // Padding ZERADO: as páginas já aplicam px-4 manualmente. O padding 2rem
      // fixo do config somava com o px-4 → padding duplo (até 48px) cortava
      // conteúdo no mobile. Agora só o px-4 das páginas vale.
      padding: "0",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Hierarquia por tamanho, não por peso: no máximo 400/500/600. Os
      // utilitários mais pesados (bold/extrabold/black, ainda espalhados pelo
      // código) passam a render em 600 — uma escala, sem 800/900 gritando.
      fontWeight: {
        bold: "600",
        extrabold: "600",
        black: "600",
      },
      fontFamily: {
        display: ["Outfit", "sans-serif"],
        body: ["Inter", "sans-serif"],
        brand: ["Georgia", "Times New Roman", "serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        caramel: {
          DEFAULT: "hsl(var(--caramel))",
          light: "hsl(var(--caramel-light))",
          dark: "hsl(var(--caramel-dark))",
        },
        cream: "hsl(var(--cream))",
        chocolate: "hsl(var(--chocolate))",
        coffee: "hsl(var(--coffee))",
        gold: "hsl(var(--gold))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      // Tokens de motion: 100/150/200/300ms, entrada ease-out.
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.15s ease-in",
        "fade-up": "fade-up 0.2s ease-out both",
        "fade-in": "fade-in 0.15s ease-out both",
      },
    },
  },
  plugins: [tailwindAnimate],
} satisfies Config;
