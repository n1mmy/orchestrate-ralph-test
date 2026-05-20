import type { Config } from "tailwindcss";

/**
 * Tailwind theme tokens mirror the CSS custom properties in `app/globals.css`.
 * Every token reads from a CSS variable so the light/dark sets defined in
 * `globals.css` flow through Tailwind utilities — no per-screen hex literal.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    screens: {
      desktop: "720px",
    },
    colors: {
      transparent: "transparent",
      current: "currentColor",
      bg: "var(--color-bg)",
      surface: "var(--color-surface)",
      raised: "var(--color-raised)",
      ink: "var(--color-ink)",
      muted: "var(--color-muted)",
      line: "var(--color-line)",
      "kind-home": "var(--color-kind-home)",
      "kind-restaurant": "var(--color-kind-restaurant)",
      "kind-home-wash": "var(--color-kind-home-wash)",
      "kind-restaurant-wash": "var(--color-kind-restaurant-wash)",
      "recency-overdue": "var(--color-recency-overdue)",
      "recency-mid": "var(--color-recency-mid)",
      "recency-recent": "var(--color-recency-recent)",
      action: "var(--color-action)",
      "action-hover": "var(--color-action-hover)",
      "action-ink": "var(--color-action-ink)",
      success: "var(--color-success)",
      "success-wash": "var(--color-success-wash)",
      danger: "var(--color-danger)",
      "danger-wash": "var(--color-danger-wash)",
      planned: "var(--color-planned)",
      exclude: "var(--color-exclude)",
      "exclude-wash": "var(--color-exclude-wash)",
    },
    fontFamily: {
      display: ["var(--font-display)", "serif"],
      sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      mono: ["var(--font-mono)", "ui-monospace", "monospace"],
    },
    fontSize: {
      h1: ["var(--text-h1)", { lineHeight: "1.2", fontWeight: "600" }],
      name: ["var(--text-name)", { lineHeight: "1.3", fontWeight: "500" }],
      body: ["var(--text-body)", { lineHeight: "1.5" }],
      chip: ["var(--text-chip)", { lineHeight: "1.3" }],
      meta: ["var(--text-meta)", { lineHeight: "1.3" }],
    },
    fontWeight: {
      regular: "var(--weight-regular)",
      medium: "var(--weight-medium)",
      semibold: "var(--weight-semibold)",
    },
    spacing: {
      "0": "0",
      "2xs": "var(--space-2xs)",
      xs: "var(--space-xs)",
      sm: "var(--space-sm)",
      md: "var(--space-md)",
      lg: "var(--space-lg)",
      xl: "var(--space-xl)",
      "2xl": "var(--space-2xl)",
      "3xl": "var(--space-3xl)",
    },
    borderRadius: {
      none: "0",
      badge: "var(--radius-badge)",
      input: "var(--radius-input)",
      control: "var(--radius-control)",
    },
    transitionDuration: {
      micro: "var(--motion-micro)",
      short: "var(--motion-short)",
      medium: "var(--motion-medium)",
    },
    extend: {
      maxWidth: {
        column: "var(--column-max)",
      },
    },
  },
  plugins: [],
};

export default config;
