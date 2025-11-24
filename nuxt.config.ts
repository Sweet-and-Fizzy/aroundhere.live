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
      title: 'Local Music Listings',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Discover live music events in Western Massachusetts' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
    },
  },

  // Runtime config for environment variables
  runtimeConfig: {
    // Server-only
    databaseUrl: process.env.DATABASE_URL,
    // Public (exposed to client)
    public: {
      regionName: 'Western Massachusetts',
    },
  },

  modules: ['@nuxt/ui'],

  // Force light mode by default
  colorMode: {
    preference: 'light',
  },
})