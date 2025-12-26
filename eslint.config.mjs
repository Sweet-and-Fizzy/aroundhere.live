import js from '@eslint/js'
import typescript from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

// Nuxt auto-imports these globals
const nuxtGlobals = {
  // Vue
  ref: 'readonly',
  computed: 'readonly',
  watch: 'readonly',
  watchEffect: 'readonly',
  onMounted: 'readonly',
  onUnmounted: 'readonly',
  onBeforeMount: 'readonly',
  onBeforeUnmount: 'readonly',
  reactive: 'readonly',
  toRef: 'readonly',
  toRefs: 'readonly',
  defineProps: 'readonly',
  defineEmits: 'readonly',
  defineExpose: 'readonly',
  withDefaults: 'readonly',
  // Nuxt client
  useRoute: 'readonly',
  useRouter: 'readonly',
  useFetch: 'readonly',
  useAsyncData: 'readonly',
  useLazyFetch: 'readonly',
  useLazyAsyncData: 'readonly',
  useHead: 'readonly',
  useSeoMeta: 'readonly',
  useRuntimeConfig: 'readonly',
  useState: 'readonly',
  navigateTo: 'readonly',
  $fetch: 'readonly',
  useEvents: 'readonly',
  useToast: 'readonly',
  // Nuxt auth utils
  useUserSession: 'readonly',
  getUserSession: 'readonly',
  setUserSession: 'readonly',
  clearUserSession: 'readonly',
  // Nuxt route/page macros
  defineNuxtRouteMiddleware: 'readonly',
  definePageMeta: 'readonly',
  // Nuxt server
  defineEventHandler: 'readonly',
  defineNuxtConfig: 'readonly',
  defineAppConfig: 'readonly',
  readBody: 'readonly',
  getRouterParam: 'readonly',
  createError: 'readonly',
  setResponseHeaders: 'readonly',
  getQuery: 'readonly',
  // Browser globals
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  console: 'readonly',
  window: 'readonly',
  document: 'readonly',
  EventSource: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  fetch: 'readonly',
  URLSearchParams: 'readonly',
  HTMLElement: 'readonly',
  HTMLAnchorElement: 'readonly',
  HTMLButtonElement: 'readonly',
  sessionStorage: 'readonly',
  localStorage: 'readonly',
  requestAnimationFrame: 'readonly',
  AbortSignal: 'readonly',
  // Node.js globals (for server files)
  process: 'readonly',
  NodeJS: 'readonly',
  URL: 'readonly',
  // Nuxt server utilities
  setHeader: 'readonly',
  getHeader: 'readonly',
  defineNitroPlugin: 'readonly',
  // Auto-imported utilities
  stripHtmlAndClean: 'readonly',
  sendMagicLinkEmail: 'readonly',
  sendPasswordResetEmail: 'readonly',
  // nuxt-auth-utils OAuth handlers
  defineOAuthGoogleEventHandler: 'readonly',
  // h3 utilities
  sendRedirect: 'readonly',
  // Custom composables
  useCurrentRegion: 'readonly',
  useGenreLabels: 'readonly',
  useEventTypeLabels: 'readonly',
  useLocationFilter: 'readonly',
  useFavorites: 'readonly',
  useEventTime: 'readonly',
  // Browser/DOM globals
  KeyboardEvent: 'readonly',
  Event: 'readonly',
  HTMLInputElement: 'readonly',
  GeolocationPosition: 'readonly',
  navigator: 'readonly',
  Response: 'readonly',
}

export default [
  js.configs.recommended,
  prettier,
  {
    ignores: [
      'node_modules/**',
      '.nuxt/**',
      '.output/**',
      'dist/**',
      '.git/**',
    ],
  },
  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: nuxtGlobals,
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-unused-vars': 'off', // Use TypeScript's version
    },
  },
  // Vue files - use flat config from eslint-plugin-vue
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: typescriptParser,
      },
      globals: nuxtGlobals,
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'warn',
      'vue/require-default-prop': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
]
