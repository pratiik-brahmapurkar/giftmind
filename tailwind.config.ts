import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";
import tailwindcssAnimate from "tailwindcss-animate";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        heading: ["Fraunces", "Georgia", "serif"],
        sans:    ["Inter", ...fontFamily.sans],
        body:    ["Inter", ...fontFamily.sans],
        mono:    ["JetBrains Mono", ...fontFamily.mono],
      },
      colors: {
        // Semantic tokens (CSS variable references)
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        error:   "hsl(var(--error))",
        // Raw palette scales (for direct use in components)
        amber: {
          50:  "#FAF5E8",
          100: "#F5E9C8",
          200: "#EDD490",
          300: "#F5C842",
          400: "#D4A04A",
          500: "#B8852F",
          600: "#96681E",
          700: "#7A5215",
          800: "#573A0E",
          900: "#3D2809",
          950: "#2B1F0F",
        },
        indigo: {
          50:  "#F3EFFA",
          100: "#E2D8F5",
          200: "#C4B1EB",
          300: "#9B7FD4",
          400: "#7A57BE",
          500: "#5E3DA0",
          600: "#4C2A85",
          700: "#3C1F6B",
          800: "#2A1450",
          900: "#1C0C38",
          950: "#160B28",
        },
        neutral: {
          50:  "#FAF7F2",
          100: "#F0EBE1",
          200: "#DDD4C5",
          300: "#C8BBAA",
          400: "#A89A87",
          500: "#8A7E70",
          600: "#6E6358",
          700: "#544A40",
          800: "#3C342A",
          900: "#2A231A",
          950: "#1A1816",
        },
      },
      borderRadius: {
        none: "0px",
        sm:   "4px",
        md:   "8px",
        lg:   "12px",
        xl:   "16px",
        "2xl": "24px",
        full: "9999px",
        DEFAULT: "8px",
      },
      boxShadow: {
        sm:    "0 1px 2px rgba(42, 39, 36, 0.06)",
        md:    "0 4px 8px rgba(42, 39, 36, 0.08), 0 2px 4px rgba(42, 39, 36, 0.06)",
        lg:    "0 8px 16px rgba(42, 39, 36, 0.10), 0 4px 8px rgba(42, 39, 36, 0.06)",
        xl:    "0 16px 32px rgba(42, 39, 36, 0.12), 0 8px 16px rgba(42, 39, 36, 0.08)",
        "glow-amber": "0 0 12px rgba(212, 160, 74, 0.35)",
        "glow-indigo": "0 0 12px rgba(76, 42, 133, 0.25)",
        "card":   "0 2px 8px rgba(42, 39, 36, 0.08)",
        "card-hover": "0 6px 20px rgba(42, 39, 36, 0.12)",
        none:  "none",
      },
      fontSize: {
        "display-xl": ["4.5rem",  { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "700" }],
        "display-lg": ["3.75rem", { lineHeight: "1.08", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-md": ["3rem",    { lineHeight: "1.10", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-sm": ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-xl": ["1.875rem",{ lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-lg": ["1.5rem",  { lineHeight: "1.30", letterSpacing: "0em",     fontWeight: "600" }],
        "heading-md": ["1.25rem", { lineHeight: "1.40", letterSpacing: "0em",     fontWeight: "600" }],
        "heading-sm": ["1.125rem",{ lineHeight: "1.45", letterSpacing: "0em",     fontWeight: "600" }],
        "body-lg":    ["1.0625rem",{ lineHeight: "1.70", letterSpacing: "0em",    fontWeight: "400" }],
        "body-md":    ["0.9375rem",{ lineHeight: "1.65", letterSpacing: "0em",    fontWeight: "400" }],
        "body-sm":    ["0.875rem", { lineHeight: "1.60", letterSpacing: "0em",    fontWeight: "400" }],
        "caption":    ["0.8125rem",{ lineHeight: "1.50", letterSpacing: "0.01em", fontWeight: "400" }],
        "micro":      ["0.75rem",  { lineHeight: "1.45", letterSpacing: "0.02em", fontWeight: "500" }],
      },
      spacing: {
        "18": "4.5rem",
        "30": "7.5rem",
        "36": "9rem",
      },
      transitionTimingFunction: {
        "snappy":     "cubic-bezier(0.4, 0, 0.2, 1)",
        "out-warm":   "cubic-bezier(0.0, 0, 0.2, 1)",
        "in-warm":    "cubic-bezier(0.4, 0, 1, 1)",
        "spring":     "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "ceremonial": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        "fast":       "100ms",
        "normal":     "200ms",
        "moderate":   "300ms",
        "slow":       "500ms",
        "deliberate": "800ms",
        "ceremonial": "1200ms",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)"   },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "gift-reveal": {
          "0%":   { opacity: "0",  transform: "scale(0.95) translateY(12px)" },
          "60%":  { opacity: "1",  transform: "scale(1.02) translateY(-2px)"  },
          "100%": { transform: "scale(1)   translateY(0)"                     },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.9)" },
          to:   { opacity: "1", transform: "scale(1)"   },
        },
        "skeleton-pulse": {
          "0%, 100%": { backgroundColor: "hsl(42 60% 96%)"  },
          "50%":       { backgroundColor: "hsl(42 60% 90%)"  },
        },
        "thinking-wave": {
          "0%, 60%, 100%": { transform: "translateY(0)",   opacity: "0.4" },
          "30%":           { transform: "translateY(-6px)", opacity: "1"  },
        },
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        "shake": {
          "0%, 100%": { transform: "translateX(0)"    },
          "10%, 50%, 90%": { transform: "translateX(-4px)" },
          "30%, 70%":      { transform: "translateX(4px)"  },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "wiggle": {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(212, 160, 74, 0.22)" },
          "50%": { boxShadow: "0 0 40px rgba(212, 160, 74, 0.38)" },
        },
      },
      animation: {
        "fade-up":       "fade-up 300ms var(--ease-out-warm, cubic-bezier(0,0,0.2,1)) forwards",
        "fade-in":       "fade-in 200ms ease-out forwards",
        "gift-reveal":   "gift-reveal 500ms cubic-bezier(0.34,1.56,0.64,1) forwards",
        "scale-in":      "scale-in 200ms cubic-bezier(0.34,1.56,0.64,1) forwards",
        "skeleton":      "skeleton-pulse 1.5s ease-in-out infinite",
        "thinking":      "thinking-wave 1.4s ease-in-out infinite",
        "accordion-down": "accordion-down 200ms ease-out",
        "accordion-up":   "accordion-up 200ms ease-out",
        "shake":         "shake 500ms ease-in-out",
        "pulse":         "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 3s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
};

export default config;
