<template>
  <div class="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-900">
          Reset your password
        </h1>
        <p class="text-sm text-gray-500 mt-2">
          Enter your email address and we'll send you a link to reset your password.
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

        <!-- Success message -->
        <div
          v-if="success"
          class="rounded-md bg-green-50 p-4 mb-6"
        >
          <div class="flex">
            <div class="flex-shrink-0">
              <svg
                class="h-5 w-5 text-green-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-green-800">
                {{ success }}
              </p>
            </div>
          </div>
        </div>

        <form
          v-if="!success"
          class="space-y-4"
          @submit.prevent="handleSubmit"
        >
          <div>
            <label
              for="email"
              class="block text-sm font-medium text-gray-700 mb-1"
            >
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

          <button
            type="submit"
            :disabled="loading"
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
              Sending...
            </span>
            <span v-else>Send reset link</span>
          </button>
        </form>

        <div
          v-else
          class="text-center"
        >
          <NuxtLink
            to="/login"
            class="inline-flex items-center text-sm font-medium text-primary-600 hover:underline"
          >
            <svg
              class="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to sign in
          </NuxtLink>
        </div>

        <div
          v-if="!success"
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
const email = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

const handleSubmit = async () => {
  error.value = ''
  success.value = ''
  loading.value = true

  try {
    const response = await $fetch('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value },
    })

    success.value = response.message || 'If an account with that email exists, a password reset link has been sent.'
    email.value = ''
  } catch (err: any) {
    error.value = err.data?.message || 'Failed to send reset link. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>
