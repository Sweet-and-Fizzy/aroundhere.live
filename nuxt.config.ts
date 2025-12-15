// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // TypeScript - include DOM types for scrapers that use page.evaluate()
  typescript: {
    tsConfig: {
      compilerOptions: {
        lib: ['ESNext', 'DOM', 'DOM.Iterable'],
      },
    },
  },

  // SSR for SEO
  ssr: true,

  // App configuration
  app: {
    head: {
      title: 'AroundHere',
      htmlAttrs: {
        lang: 'en',
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Discover live music events in Western Massachusetts' },
        // Open Graph defaults
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'AroundHere' },
        { property: 'og:locale', content: 'en_US' },
        // Twitter Card defaults
        { name: 'twitter:card', content: 'summary_large_image' },
        // Theme color for mobile browsers
        { name: 'theme-color', content: '#111827' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,opsz,wght@0,6..12,200..1000;1,6..12,200..1000&display=swap' },
      ],
      script: [
        {
          innerHTML: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-WDNTCPR6');`,
        },
      ],
      noscript: [
        {
          innerHTML: `<iframe src="https://www.googletagmanager.com/ns.html?id=GTM-WDNTCPR6" height="0" width="0" style="display:none;visibility:hidden"></iframe>`,
          tagPosition: 'bodyOpen',
        },
      ],
    },
  },

  // Runtime config for environment variables
  runtimeConfig: {
    // Server-only
    databaseUrl: process.env.DATABASE_URL,
    emailFrom: process.env.EMAIL_FROM || 'AroundHere <whatsup@aroundhere.live>',
    superAdminEmail: process.env.SUPER_ADMIN_EMAIL,
    // Session configuration for nuxt-auth-utils
    session: {
      maxAge: 60 * 60 * 24 * 30, // 30 days in seconds
      cookie: {
        sameSite: 'lax',
      },
    },
    // Public (exposed to client)
    public: {
      regionName: 'Western Massachusetts',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://aroundhere.live',
    },
  },

  modules: ['@nuxt/ui', '@nuxt/ui-pro', '@nuxtjs/mdc', 'nuxt-auth-utils'],

  // Force light mode by default
  colorMode: {
    preference: 'light',
  },

  // Nuxt UI configuration
  ui: {
    safelistColors: ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'gray', 'neutral'],
  },
})