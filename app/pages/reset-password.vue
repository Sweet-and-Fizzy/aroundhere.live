<template>
  <div class="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-900">
          Set new password
        </h1>
        <p class="text-sm text-gray-500 mt-2">
          Enter your new password below.
        </p>
      </div>

      <UCard>
        <!-- Error message -->
        <div
          v-if="error"
          class="rounded-md bg-red-50 p-4 mb-6"
        >
          <div class="flex">
            <div class="flex-shrink-0">
              <svg
                class="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-red-800">
                {{ error }}
              </p>
            </div>
          </div>
        </div>

        <!-- Invalid token state -->
        <div
          v-if="!token"
          class="text-center py-4"
        >
          <p class="text-gray-600 mb-4">
            Invalid or missing reset token.
          </p>
          <NuxtLink
            to="/forgot-password"
            class="inline-flex items-center text-sm font-medium text-primary-600 hover:underline"
          >
            Request a new reset link
          </NuxtLink>
        </div>

        <!-- Reset form -->
        <form
          v-else
          class="space-y-4"
          @submit.prevent="handleSubmit"
        >
          <div>
            <label
              for="password"
              class="block text-sm font-medium text-gray-700 mb-1"
            >
              New password
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              autocomplete="new-password"
              class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-sm"
              placeholder="At least 8 characters"
              :disabled="loading"
            >
            <p
              v-if="password && password.length < 8"
              class="mt-1 text-xs text-red-600"
            >
              Password must be at least 8 characters
            </p>
          </div>

          <div>
            <label
              for="confirm-password"
              class="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirm new password
            </label>
            <input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              required
              autocomplete="new-password"
              class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-sm"
              placeholder="Confirm your new password"
              :disabled="loading"
            >
            <p
              v-if="confirmPassword && password !== confirmPassword"
              class="mt-1 text-xs text-red-600"
            >
              Passwords do not match
            </p>
          </div>

          <button
            type="submit"
            :disabled="loading || !isFormValid"
            class="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span
              v-if="loading"
              class="flex items-center"
            >
              <svg
                class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Resetting password...
            </span>
            <span v-else>Reset password</span>
          </button>
        </form>

        <div
          v-if="token"
          class="mt-6 pt-6 border-t border-gray-200 text-center"
        >
          <NuxtLink
            to="/login"
            class="text-sm text-primary-600 hover:underline"
          >
            Back to sign in
          </NuxtLink>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { fetch: refreshSession } = useUserSession()

const token = computed(() => route.query.token as string)
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

const isFormValid = computed(() => {
  return password.value.length >= 8 &&
    password.value === confirmPassword.value
})

const handleSubmit = async () => {
  error.value = ''
  loading.value = true

  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: {
        token: token.value,
        password: password.value,
      },
    })

    // Refresh session and redirect (user is auto-logged in)
    await refreshSession()
    router.push('/')
  } catch (err: any) {
    error.value = err.data?.message || 'Failed to reset password. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>
