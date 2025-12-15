import type { Config } from 'tailwindcss'

export default {
  content: [],
  theme: {
    extend: {},
  },
  safelist: [
    // Safelist all badge color variants for dynamic genre/event type colors
    // This ensures Tailwind includes these classes even though they're set dynamically
    {
      pattern: /bg-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray)-(50|100|500|600)/,
    },
    {
      pattern: /text-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray)-(600|700|900)/,
    },
    {
      pattern: /ring-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray)-(500|600)/,
    },
  ],
} satisfies Config
