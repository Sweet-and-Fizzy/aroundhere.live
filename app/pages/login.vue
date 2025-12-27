<template>
  <div class="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-900">Sign in to your account</h1>
        <p class="text-sm text-gray-500 mt-2">
          Or <NuxtLink to="/register" class="text-primary-600 hover:underline">create an account</NuxtLink>
        </p>
      </div>

      <UCard>
        <!-- Error/Success messages -->
        <div
          v-if="error"
          class="rounded-md bg-red-50 p-4 mb-6"
        >
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-red-800">{{ error }}</p>
            </div>
          </div>
        </div>

        <div
          v-if="success"
          class="rounded-md bg-green-50 p-4 mb-6"
        >
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-green-800">{{ success }}</p>
            </div>
          </div>
        </div>

        <!-- Google OAuth Button -->
        <div class="mb-6">
          <a
            :href="googleAuthUrl"
            class="w-full flex justify-center items-center gap-3 py-3 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </a>
        </div>

        <div class="relative mb-6">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-300" />
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-2 bg-white text-gray-500">Or continue with</span>
          </div>
        </div>

        <!-- Login Method Tabs -->
        <div class="flex border-b border-gray-200 mb-6">
          <button
            type="button"
            class="flex-1 py-2 px-4 text-sm font-medium text-center border-b-2 transition-colors"
            :class="loginMethod === 'password' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'"
            @click="loginMethod = 'password'"
          >
            Password
          </button>
          <button
            type="button"
            class="flex-1 py-2 px-4 text-sm font-medium text-center border-b-2 transition-colors"
            :class="loginMethod === 'magic' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'"
            @click="loginMethod = 'magic'"
          >
            Magic Link
          </button>
        </div>

        <!-- Password Login Form -->
        <form
          v-if="loginMethod === 'password'"
          class="space-y-4"
          @submit.prevent="handlePasswordLogin"
        >
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-sm"
              placeholder="you@example.com"
              :disabled="loading"
            >
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-sm"
              placeholder="Enter your password"
              :disabled="loading"
            >
          </div>

          <div class="flex items-center justify-end">
            <NuxtLink to="/forgot-password" class="text-sm text-primary-600 hover:underline">
              Forgot your password?
            </NuxtLink>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="loading" class="flex items-center">
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Signing in...
            </span>
            <span v-else>Sign in</span>
          </button>
        </form>

        <!-- Magic Link Form -->
        <form
          v-else
          class="space-y-4"
          @submit.prevent="handleMagicLink"
        >
          <div>
            <label for="magic-email" class="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              id="magic-email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-sm"
              placeholder="you@example.com"
              :disabled="loading"
            >
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="loading" class="flex items-center">
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Sending...
            </span>
            <span v-else>Send magic link</span>
          </button>

          <p class="text-xs text-gray-500 text-center mt-2">
            We'll email you a secure link that logs you in instantly.
          </p>
        </form>

        <div class="mt-6 pt-6 border-t border-gray-200">
          <p class="text-xs text-gray-500 text-center">
            By signing in, you agree to our <NuxtLink to="/privacy" class="text-primary-600 hover:underline">Privacy Policy</NuxtLink>.
          </p>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { fetch: refreshSession } = useUserSession()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')
const loginMethod = ref<'password' | 'magic'>('password')

// Get redirect URL from query param
const redirectTo = computed(() => route.query.redirect as string || '/')

// Build Google OAuth URL with redirect (uses state parameter for OAuth flow)
const googleAuthUrl = computed(() => {
  const base = '/auth/google'
  if (redirectTo.value && redirectTo.value !== '/') {
    return `${base}?state=${encodeURIComponent(redirectTo.value)}`
  }
  return base
})

// Check for OAuth errors in URL
onMounted(() => {
  const urlError = route.query.error as string
  if (urlError === 'auth_failed') {
    error.value = 'Authentication failed. Please try again.'
  } else if (urlError === 'no_email') {
    error.value = 'Could not get email from Google. Please try another method.'
  } else if (urlError === 'account_disabled') {
    error.value = 'This account has been disabled.'
  }
})

const handlePasswordLogin = async () => {
  error.value = ''
  success.value = ''
  loading.value = true

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        email: email.value,
        password: password.value,
      },
    })

    // Refresh session and redirect
    await refreshSession()
    router.push(redirectTo.value)
  } catch (err: any) {
    error.value = err.data?.message || 'Failed to sign in. Please try again.'
  } finally {
    loading.value = false
  }
}

const handleMagicLink = async () => {
  error.value = ''
  success.value = ''
  loading.value = true

  try {
    await $fetch('/api/auth/send-magic-link', {
      method: 'POST',
      body: {
        email: email.value,
        redirect: redirectTo.value !== '/' ? redirectTo.value : undefined,
      },
    })

    success.value = 'Check your email for the magic link!'
    email.value = ''
  } catch (err: any) {
    error.value = err.data?.message || 'Failed to send magic link. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>
